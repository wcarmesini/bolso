import type { Account, AuditEntry, NetWorthReport, Transaction } from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

/*
 * Rastro e lixeira.
 *
 * Duas coisas que precisam valer sempre: **quem fez o quê** fica registrado, e **excluir não
 * apaga**. A segunda é a mais perigosa de implementar: basta uma consulta esquecer o filtro
 * para um lançamento excluído continuar somando num relatório. Por isso o teste olha o que
 * mais importa — a lista, o mês a mês e o patrimônio — depois de excluir.
 */

let api: TestApi
let ana: TestUser
let bruno: TestUser
let conta: Account
let mercado: string

const lancar = (quem: TestUser, valor: number, descricao: string, data: string) =>
  quem.json<Transaction>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'expense',
      amountCents: valor,
      description: descricao,
      accountId: conta.id,
      contactId: null,
      purchaseDate: data,
      paymentDate: data,
      notes: '',
      splits: [{ categoryId: mercado, amountCents: valor }],
      installments: 1,
    }),
  })

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana Souza', 'ana@exemplo.com')
  const criada = await ana.json<Account>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Conta corrente',
      type: 'checking',
      initialBalanceCents: 100000,
      closingDay: null,
      dueDay: null,
      limitCents: null,
    }),
  })
  conta = criada.body
  const categorias =
    await ana.json<{ id: string; name: string; parentId: string | null }[]>('/api/categories')
  mercado = categorias.body.find((item) => item.name === 'Mercado' && !item.parentId)?.id ?? ''

  // A segunda pessoa do grupo, para o histórico ter mais de um autor
  const convite = await ana.json<{ id: string }>('/api/groups/current/invitations', {
    method: 'POST',
    body: JSON.stringify({ email: 'bruno@exemplo.com' }),
  })
  bruno = await api.signIn('Bruno Lima', 'bruno@exemplo.com')
  const aceito = await bruno.request(`/api/invitations/${convite.body.id}/accept`, {
    method: 'POST',
  })
  if (!aceito.ok) throw new Error(`Bruno não entrou no grupo: ${aceito.status}`)
})

afterAll(async () => {
  await api.close()
})

describe('rastro', () => {
  it('guarda quem criou e quem mudou o quê', async () => {
    const criado = await lancar(ana, 5000, 'Feira', '2026-09-10')
    expect(criado.status).toBe(201)

    await ana.request(`/api/transactions/${criado.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 5500,
        description: 'Feira da semana',
        accountId: conta.id,
        contactId: null,
        purchaseDate: '2026-09-10',
        paymentDate: '2026-09-10',
        notes: '',
        splits: [{ categoryId: mercado, amountCents: 5500 }],
        installments: 1,
      }),
    })

    const historico = await ana.json<AuditEntry[]>(`/api/transactions/${criado.body.id}/history`)
    expect(historico.status).toBe(200)
    // Do mais recente para o mais antigo: a alteração e, embaixo, a criação
    expect(historico.body.map((item) => item.action)).toEqual(['update', 'create'])
    expect(historico.body[1]?.actorName).toBe('Ana Souza')

    const mudancas = historico.body[0]?.changes ?? []
    expect(mudancas.find((item) => item.field === 'amountCents')).toEqual({
      field: 'amountCents',
      from: 5000,
      to: 5500,
    })
    expect(mudancas.find((item) => item.field === 'description')).toEqual({
      field: 'description',
      from: 'Feira',
      to: 'Feira da semana',
    })
  })

  it('registra o nome de quem mexeu, mesmo sendo outra pessoa do grupo', async () => {
    const criado = await lancar(ana, 3000, 'Padaria', '2026-09-11')
    await bruno.request(`/api/transactions/${criado.body.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 3000,
        description: 'Padaria da esquina',
        accountId: conta.id,
        contactId: null,
        purchaseDate: '2026-09-11',
        paymentDate: '2026-09-11',
        notes: '',
        splits: [{ categoryId: mercado, amountCents: 3000 }],
        installments: 1,
      }),
    })

    const historico = await ana.json<AuditEntry[]>(`/api/transactions/${criado.body.id}/history`)
    expect(historico.body[0]?.actorName).toBe('Bruno Lima')
    expect(historico.body[1]?.actorName).toBe('Ana Souza')
  })
})

describe('lixeira', () => {
  it('excluir some de tudo, mas o lançamento continua no banco', async () => {
    const criado = await lancar(ana, 20000, 'Compra grande', '2026-09-12')

    const antes = await ana.json<{ income: { totalCents: number }; expense: MonthlySoma }>(
      '/api/reports/monthly?start=2026-09&count=1',
    )
    const gastoAntes = antes.body.expense.totalCents

    const excluir = await bruno.request(`/api/transactions/${criado.body.id}`, {
      method: 'DELETE',
    })
    expect(excluir.status).toBe(204)

    // Sumiu da lista
    const lista = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    expect(lista.body.some((item) => item.id === criado.body.id)).toBe(false)

    // Sumiu dos relatórios
    const depois = await ana.json<{ expense: MonthlySoma }>(
      '/api/reports/monthly?start=2026-09&count=1',
    )
    expect(depois.body.expense.totalCents).toBe(gastoAntes - 20000)

    // Sumiu do patrimônio: o saldo da conta volta ao que era
    const patrimonio = await ana.json<NetWorthReport>(
      '/api/reports/net-worth?start=2026-09&count=1',
    )
    const saldo = patrimonio.body.assets.rows.find((row) => row.accountId === conta.id)
    expect(saldo?.values[0]).toBe(100000 - 5500 - 3000)

    // Mas está na lixeira, com quem excluiu
    const lixeira = await ana.json<{ id: string; deletedByName: string }[]>(
      '/api/transactions/deleted',
    )
    const naLixeira = lixeira.body.find((item) => item.id === criado.body.id)
    expect(naLixeira?.deletedByName).toBe('Bruno Lima')
  })

  it('restaurar traz de volta com as categorias', async () => {
    const lixeira = await ana.json<{ id: string; description: string }[]>(
      '/api/transactions/deleted',
    )
    const alvo = lixeira.body.find((item) => item.description === 'Compra grande')

    const volta = await ana.request(`/api/transactions/${alvo?.id}/restore`, { method: 'POST' })
    expect(volta.status).toBe(204)

    const lista = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    const voltou = lista.body.find((item) => item.id === alvo?.id)
    expect(voltou?.amountCents).toBe(20000)
    expect(voltou?.splits[0]?.categoryId).toBe(mercado)

    // A exclusão e a volta ficaram no histórico
    const historico = await ana.json<AuditEntry[]>(`/api/transactions/${alvo?.id}/history`)
    expect(historico.body.map((item) => item.action)).toEqual(['restore', 'delete', 'create'])

    const aindaNaLixeira = await ana.json<{ id: string }[]>('/api/transactions/deleted')
    expect(aindaNaLixeira.body.some((item) => item.id === alvo?.id)).toBe(false)
  })

  it('não restaura lançamento de outro grupo', async () => {
    const sozinho = await api.signIn('Carla', 'carla@exemplo.com')
    const lixeira = await sozinho.json<{ id: string }[]>('/api/transactions/deleted')
    expect(lixeira.body).toEqual([])
  })
})

type MonthlySoma = { totalCents: number }
