import type { Account, Category, GroupMember, Me } from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser
let bruno: TestUser
let carla: TestUser
let grupoDaAna: string

/** Convida, a pessoa aceita, e devolve o registro dela na lista de quem tem acesso */
async function compartilhar(quem: TestUser, email: string, role: 'member' | 'viewer') {
  const convite = await ana.json<{ id: string }>('/api/groups/current/invitations', {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
  await quem.request(`/api/invitations/${convite.body.id}/accept`, { method: 'POST' })
  const membros = await ana.json<GroupMember[]>('/api/groups/current/members')
  return membros.body.find((pessoa) => pessoa.email === email)
}

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
  carla = await api.signIn('Carla', 'carla@exemplo.com')
  grupoDaAna = (await ana.json<Me>('/api/me')).body.activeGroup?.id ?? ''
  await ana.request('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Conta corrente',
      type: 'checking',
      initialBalanceCents: 0,
      closingDay: null,
      dueDay: null,
      limitCents: null,
    }),
  })
})

afterAll(async () => {
  await api.close()
})

describe('quem só pode ver', () => {
  it('entra pelo convite já como "pode ver"', async () => {
    const dele = await compartilhar(bruno, 'bruno@exemplo.com', 'viewer')
    expect(dele?.role).toBe('viewer')

    const me = await bruno.json<Me>('/api/me')
    expect(me.body.activeGroup?.id).toBe(grupoDaAna)
    expect(me.body.activeGroup?.role).toBe('viewer')
  })

  it('enxerga tudo o que existe no orçamento', async () => {
    const contas = await bruno.json<Account[]>('/api/accounts')
    expect(contas.status).toBe(200)
    expect(contas.body.map((conta) => conta.name)).toContain('Conta corrente')

    const categorias = await bruno.json<Category[]>('/api/categories')
    expect(categorias.body.length).toBeGreaterThan(0)

    const lancamentos = await bruno.request('/api/transactions?month=2026-09')
    expect(lancamentos.status).toBe(200)
  })

  it('não grava nada: nem lançamento, nem conta, nem categoria', async () => {
    const contas = await bruno.json<Account[]>('/api/accounts')
    const conta = contas.body[0]
    const cats = await bruno.json<Category[]>('/api/categories')
    const categoria = cats.body.find((item) => item.kind === 'expense')

    const tentativas = await Promise.all([
      bruno.json<{ error: string }>('/api/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type: 'expense',
          amountCents: 1000,
          description: 'Não deveria entrar',
          accountId: conta?.id,
          purchaseDate: '2026-09-20',
          paymentDate: '2026-09-20',
          splits: [{ categoryId: categoria?.id, amountCents: 1000 }],
        }),
      }),
      bruno.json<{ error: string }>('/api/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Conta pirata',
          type: 'cash',
          initialBalanceCents: 0,
          closingDay: null,
          dueDay: null,
          limitCents: null,
        }),
      }),
      bruno.json<{ error: string }>(`/api/categories/${categoria?.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Renomeada', kind: 'expense', icon: 'tag', color: '#ef4444' }),
      }),
      bruno.json<{ error: string }>(`/api/accounts/${conta?.id}`, { method: 'DELETE' }),
      bruno.json<{ error: string }>('/api/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: 'chave', scopes: ['read'] }),
      }),
    ])
    for (const tentativa of tentativas) {
      expect(tentativa.status).toBe(403)
      expect(tentativa.body.error).toContain('só de leitura')
    }

    // E nada disso deixou rastro
    const depois = await ana.json<Account[]>('/api/accounts')
    expect(depois.body.map((item) => item.name)).toEqual(['Conta corrente'])
  })

  it('não convida ninguém nem renomeia o orçamento', async () => {
    const convite = await bruno.json<{ error: string }>('/api/groups/current/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'outra@exemplo.com', role: 'member' }),
    })
    expect(convite.status).toBe(403)

    const renomear = await bruno.json<{ error: string }>('/api/groups/current', {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Orçamento invadido' }),
    })
    expect(renomear.status).toBe(403)
  })

  it('continua dono do próprio orçamento', async () => {
    const me = await bruno.json<Me>('/api/me')
    const proprio = me.body.groups.find((grupo) => grupo.id !== grupoDaAna)
    expect(proprio?.role).toBe('owner')

    await bruno.request(`/api/groups/${proprio?.id}/activate`, { method: 'POST' })
    const laDentro = await bruno.request('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Carteira',
        type: 'cash',
        initialBalanceCents: 0,
        closingDay: null,
        dueDay: null,
        limitCents: null,
      }),
    })
    expect(laDentro.status).toBe(201)
    await bruno.request(`/api/groups/${grupoDaAna}/activate`, { method: 'POST' })
  })
})

describe('mudar o nível de alguém', () => {
  it('de "pode ver" para "pode editar", e o servidor passa a deixar', async () => {
    const membros = await ana.json<GroupMember[]>('/api/groups/current/members')
    const oBruno = membros.body.find((pessoa) => pessoa.email === 'bruno@exemplo.com')

    const mudou = await ana.json<{ role: string }>(`/api/groups/current/members/${oBruno?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'member' }),
    })
    expect(mudou.status).toBe(200)

    const agora = await bruno.request('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Poupança',
        type: 'savings',
        initialBalanceCents: 0,
        closingDay: null,
        dueDay: null,
        limitCents: null,
      }),
    })
    expect(agora.status).toBe(201)
  })

  it('o dono não se rebaixa nem se tira', async () => {
    const membros = await ana.json<GroupMember[]>('/api/groups/current/members')
    const aAna = membros.body.find((pessoa) => pessoa.email === 'ana@exemplo.com')

    const baixar = await ana.json<{ error: string }>(`/api/groups/current/members/${aAna?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'viewer' }),
    })
    expect(baixar.status).toBe(403)

    const tirar = await ana.json<{ error: string }>(`/api/groups/current/members/${aAna?.id}`, {
      method: 'DELETE',
    })
    expect(tirar.status).toBe(403)
  })

  it('quem só participa não muda o nível de ninguém', async () => {
    const membros = await ana.json<GroupMember[]>('/api/groups/current/members')
    const oBruno = membros.body.find((pessoa) => pessoa.email === 'bruno@exemplo.com')

    const tentativa = await bruno.json<{ error: string }>(
      `/api/groups/current/members/${oBruno?.id}`,
      { method: 'PATCH', body: JSON.stringify({ role: 'viewer' }) },
    )
    expect(tentativa.status).toBe(403)
  })
})

describe('tirar o acesso', () => {
  it('a pessoa sai do orçamento na hora e perde o que via', async () => {
    await compartilhar(carla, 'carla@exemplo.com', 'member')
    const membros = await ana.json<GroupMember[]>('/api/groups/current/members')
    const aCarla = membros.body.find((pessoa) => pessoa.email === 'carla@exemplo.com')

    const fora = await ana.json<{ id: string }>(`/api/groups/current/members/${aCarla?.id}`, {
      method: 'DELETE',
    })
    expect(fora.status).toBe(200)

    const depois = await ana.json<GroupMember[]>('/api/groups/current/members')
    expect(depois.body.map((pessoa) => pessoa.email)).not.toContain('carla@exemplo.com')

    // A Carla volta para o próprio orçamento, e o da Ana sumiu da lista dela
    const dela = await carla.json<Me>('/api/me')
    expect(dela.body.groups.map((grupo) => grupo.id)).not.toContain(grupoDaAna)
    const contas = await carla.json<Account[]>('/api/accounts')
    expect(contas.body.map((conta) => conta.name)).not.toContain('Conta corrente')
  })

  it('um convite pendente pode ser desfeito', async () => {
    const convite = await ana.json<{ id: string }>('/api/groups/current/invitations', {
      method: 'POST',
      body: JSON.stringify({ email: 'ninguem@exemplo.com', role: 'viewer' }),
    })
    const cancelado = await ana.request(`/api/groups/current/invitations/${convite.body.id}`, {
      method: 'DELETE',
    })
    expect(cancelado.status).toBe(200)

    const pendentes = await ana.json<{ email: string }[]>('/api/groups/current/invitations')
    expect(pendentes.body.map((item) => item.email)).not.toContain('ninguem@exemplo.com')
  })
})
