import type {
  Account,
  CashFlowReport,
  CategoriesReport,
  MonthlyReport,
  PeopleReport,
  Transaction,
} from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser
let corrente: Account
let poupanca: Account
let transferId: string

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')

  const criarConta = async (name: string) => {
    const resposta = await ana.json<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 'checking',
        initialBalanceCents: 0,
        closingDay: null,
        dueDay: null,
        limitCents: null,
      }),
    })
    return resposta.body
  }
  corrente = await criarConta('Conta corrente')
  poupanca = await criarConta('Poupança')
})

afterAll(async () => {
  await api.close()
})

const transferir = (body: Record<string, unknown>) =>
  ana.json<Transaction>('/api/transfers', { method: 'POST', body: JSON.stringify(body) })

const listar = async (query = '') =>
  (await ana.json<Transaction[]>(`/api/transactions${query}`)).body

describe('transferência entre contas', () => {
  it('vira duas pernas: sai de uma conta e entra na outra', async () => {
    const resposta = await transferir({
      fromAccountId: corrente.id,
      toAccountId: poupanca.id,
      amountCents: 100000,
      date: '2032-03-10',
      description: 'Guardar para a viagem',
    })
    expect(resposta.status).toBe(201)
    expect(resposta.body.transfer?.counterpartAccountId).toBe(poupanca.id)
    transferId = resposta.body.transfer?.groupId ?? ''

    const todos = await listar('?month=2032-03')
    const pernas = todos.filter((item) => item.transfer?.groupId === transferId)
    expect(pernas).toHaveLength(2)

    const saida = pernas.find((item) => item.type === 'expense')
    const entrada = pernas.find((item) => item.type === 'income')
    expect(saida?.accountId).toBe(corrente.id)
    expect(saida?.transfer?.counterpartAccountId).toBe(poupanca.id)
    expect(entrada?.accountId).toBe(poupanca.id)
    expect(entrada?.transfer?.counterpartAccountId).toBe(corrente.id)
    // Sem categoria: transferência não é gasto nem ganho
    expect(saida?.splits).toEqual([])
  })

  it('cada conta enxerga o próprio lado', async () => {
    const daCorrente = await listar(`?month=2032-03&accountId=${corrente.id}`)
    expect(daCorrente.map((item) => item.type)).toEqual(['expense'])
    const daPoupanca = await listar(`?month=2032-03&accountId=${poupanca.id}`)
    expect(daPoupanca.map((item) => item.type)).toEqual(['income'])
  })

  it('não aparece em nenhum relatório', async () => {
    const categorias = await ana.json<CategoriesReport>(
      '/api/reports/categories?month=2032-03&type=expense',
    )
    expect(categorias.body.categories).toEqual([])
    expect(categorias.body.totalCents).toBe(0)

    const mes = await ana.json<MonthlyReport>(
      '/api/reports/monthly?start=2032-03&count=1&interval=month',
    )
    expect(mes.body.expense.totalCents).toBe(0)
    expect(mes.body.income.totalCents).toBe(0)

    const caixa = await ana.json<CashFlowReport>('/api/reports/cash-flow?year=2032')
    const marco = caixa.body.months.find((item) => item.month === '2032-03')
    expect(marco?.expenseCents).toBe(0)
    expect(marco?.incomeCents).toBe(0)

    const pessoas = await ana.json<PeopleReport>('/api/reports/people?month=2032-03')
    expect(pessoas.body.people.every((person) => person.expenseCents === 0)).toBe(true)
  })

  it('editar muda as duas pernas de uma vez', async () => {
    const resposta = await ana.json<Transaction>(`/api/transfers/${transferId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        fromAccountId: poupanca.id,
        toAccountId: corrente.id,
        amountCents: 50000,
        date: '2032-03-15',
        description: 'Resgatar metade',
      }),
    })
    expect(resposta.status).toBe(200)

    const pernas = (await listar('?month=2032-03')).filter(
      (item) => item.transfer?.groupId === transferId,
    )
    expect(pernas).toHaveLength(2)
    expect(pernas.every((item) => item.amountCents === 50000)).toBe(true)
    expect(pernas.every((item) => item.purchaseDate === '2032-03-15')).toBe(true)
    // Agora o dinheiro vai no sentido contrário
    expect(pernas.find((item) => item.type === 'expense')?.accountId).toBe(poupanca.id)
  })

  it('recusa transferir para a mesma conta', async () => {
    const resposta = await transferir({
      fromAccountId: corrente.id,
      toAccountId: corrente.id,
      amountCents: 1000,
      date: '2032-03-20',
      description: '',
    })
    expect(resposta.status).toBe(400)
    const erro = resposta.body as unknown as { field: string }
    expect(erro.field).toBe('toAccountId')
  })

  it('recusa conta de outro grupo', async () => {
    const bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
    const dele = await bruno.json<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Conta do Bruno',
        type: 'checking',
        initialBalanceCents: 0,
        closingDay: null,
        dueDay: null,
        limitCents: null,
      }),
    })
    const resposta = await transferir({
      fromAccountId: corrente.id,
      toAccountId: dele.body.id,
      amountCents: 1000,
      date: '2032-03-20',
      description: '',
    })
    expect(resposta.status).toBe(400)
  })

  it('excluir apaga as duas pernas', async () => {
    const resposta = await ana.request(`/api/transfers/${transferId}`, { method: 'DELETE' })
    expect(resposta.status).toBe(204)
    const sobrou = (await listar('?month=2032-03')).filter((item) => item.transfer !== null)
    expect(sobrou).toEqual([])

    const denovo = await ana.request(`/api/transfers/${transferId}`, { method: 'DELETE' })
    expect(denovo.status).toBe(404)
  })
})
