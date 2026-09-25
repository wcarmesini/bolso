import type { Account, Category, GroupContents, Me, Transaction } from '@bolso/shared'
import { count, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { accounts } from '../src/db/schema'
import { createTestApi, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser
let bruno: TestUser
/** O orçamento que a Ana ganhou ao entrar */
let primeiro: string
/** Um segundo orçamento da Ana, com conta e lançamento dentro, feito para ser excluído */
let viagem: string

const meuId = async (quem: TestUser) => (await quem.json<Me>('/api/me')).body.activeGroup?.id ?? ''

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
  primeiro = await meuId(ana)

  const criado = await ana.json<{ id: string }>('/api/groups', {
    method: 'POST',
    body: JSON.stringify({ name: 'Viagem' }),
  })
  viagem = criado.body.id
  await ana.request(`/api/groups/${viagem}/activate`, { method: 'POST' })

  const conta = await ana.json<Account>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Carteira',
      type: 'cash',
      initialBalanceCents: 10_000,
      closingDay: null,
      dueDay: null,
      limitCents: null,
    }),
  })
  const categorias = await ana.json<Category[]>('/api/categories')
  const alguma = categorias.body.find((categoria) => categoria.kind === 'expense')
  await ana.json<Transaction>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'expense',
      amountCents: 2500,
      description: 'Hostel',
      accountId: conta.body.id,
      contactId: null,
      purchaseDate: '2026-09-10',
      paymentDate: '2026-09-10',
      notes: '',
      splits: [{ categoryId: alguma?.id, amountCents: 2500 }],
      installments: 1,
    }),
  })
})

afterAll(async () => {
  await api.close()
})

describe('o que tem dentro do orçamento', () => {
  it('conta gente, contas, categorias e lançamentos', async () => {
    const conteudo = await ana.json<GroupContents>(`/api/groups/${viagem}/contents`)
    expect(conteudo.status).toBe(200)
    expect(conteudo.body).toMatchObject({
      id: viagem,
      name: 'Viagem',
      people: 1,
      accounts: 1,
      transactions: 1,
    })
    expect(conteudo.body.categories).toBeGreaterThan(0)
  })

  it('vale para um orçamento que não está em uso', async () => {
    const conteudo = await ana.json<GroupContents>(`/api/groups/${primeiro}/contents`)
    expect(conteudo.body.name).toBe('Meu Bolso')
    expect(conteudo.body.transactions).toBe(0)
  })

  it('um orçamento de outra pessoa não existe', async () => {
    const resposta = await bruno.request(`/api/groups/${viagem}/contents`)
    expect(resposta.status).toBe(404)
  })
})

describe('excluir orçamento', () => {
  it('de outra pessoa, não dá — e nem se sabe que existe', async () => {
    const resposta = await bruno.json<{ error: string }>(`/api/groups/${viagem}`, {
      method: 'DELETE',
    })
    expect(resposta.status).toBe(404)
  })

  it('quem só participa não exclui', async () => {
    const convite = await ana.json<{ id: string }>('/api/groups/current/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'bruno@exemplo.com' }),
    })
    await bruno.request(`/api/invitations/${convite.body.id}/accept`, { method: 'POST' })

    const resposta = await bruno.json<{ error: string }>(`/api/groups/${viagem}`, {
      method: 'DELETE',
    })
    expect(resposta.status).toBe(403)
    expect(resposta.body.error).toContain('dono')
  })

  it('o único orçamento da pessoa não pode ser excluído', async () => {
    const carla = await api.signIn('Carla', 'carla@exemplo.com')
    const so = await carla.json<Me>('/api/me')
    expect(so.body.groups.length).toBe(1)

    const resposta = await carla.json<{ error: string }>(`/api/groups/${so.body.groups[0]?.id}`, {
      method: 'DELETE',
    })
    expect(resposta.status).toBe(400)
    expect(resposta.body.error).toContain('único orçamento')
  })

  it('apaga tudo o que era de lá e devolve a pessoa para outro orçamento', async () => {
    // O Bruno fica só com a Viagem: é o caso de quem perde o único orçamento que tinha
    const dele = await bruno.json<Me>('/api/me')
    const proprio = dele.body.groups.find((grupo) => grupo.role === 'owner')
    await bruno.request(`/api/groups/${proprio?.id}`, { method: 'DELETE' })

    const antes = await api.db
      .select({ n: count() })
      .from(accounts)
      .where(eq(accounts.groupId, viagem))
    expect(antes[0]?.n).toBe(1)

    const resposta = await ana.json<{ activeGroupId: string }>(`/api/groups/${viagem}`, {
      method: 'DELETE',
    })
    expect(resposta.status).toBe(200)
    expect(resposta.body.activeGroupId).toBe(primeiro)

    const depois = await api.db
      .select({ n: count() })
      .from(accounts)
      .where(eq(accounts.groupId, viagem))
    expect(depois[0]?.n).toBe(0)

    const me = await ana.json<Me>('/api/me')
    expect(me.body.activeGroup?.id).toBe(primeiro)
    expect(me.body.groups.map((grupo) => grupo.id)).not.toContain(viagem)

    // O Bruno, que participava, perde o acesso — e, sem nenhum outro, ganha o próprio de volta
    const doBruno = await bruno.json<Me>('/api/me')
    expect(doBruno.body.groups.map((grupo) => grupo.id)).not.toContain(viagem)
    expect(doBruno.body.groups.length).toBe(1)
    expect(doBruno.body.groups[0]?.role).toBe('owner')
  })
})
