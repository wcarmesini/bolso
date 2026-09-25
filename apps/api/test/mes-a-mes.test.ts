import type { Account, Category, MonthlyReport, Transaction } from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser
const ids = new Map<string, string>()
let cartao: Account

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  const categorias = await ana.json<Category[]>('/api/categories')
  for (const categoria of categorias.body) ids.set(categoria.name, categoria.id)

  const conta = await ana.json<Account>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Cartão',
      type: 'credit_card',
      initialBalanceCents: 0,
      closingDay: 25,
      dueDay: 5,
      limitCents: 1000000,
    }),
  })
  cartao = conta.body
})

afterAll(async () => {
  await api.close()
})

const id = (nome: string) => {
  const encontrado = ids.get(nome)
  if (!encontrado) throw new Error(`Categoria ${nome} não existe`)
  return encontrado
}

const lancar = (body: Record<string, unknown>) =>
  ana.json<Transaction>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'expense',
      description: '',
      accountId: null,
      paymentDate: null,
      ...body,
    }),
  })

const relatorio = (query: string) => ana.json<MonthlyReport>(`/api/reports/monthly?${query}`)

const linha = (report: MonthlyReport, tipo: 'expense' | 'income', nome: string) =>
  report[tipo].rows.find((row) => row.name === nome)

describe('competência e caixa no mês a mês', () => {
  beforeAll(async () => {
    // Compra no cartão em 26/01 (depois do fechamento): a fatura vence em 05/03
    await lancar({
      amountCents: 50000,
      description: 'Jantar no cartão',
      accountId: cartao.id,
      purchaseDate: '2031-01-26',
      splits: [{ categoryId: id('Restaurante'), amountCents: 50000 }],
    })
    // Dinheiro: compra e pagamento no mesmo dia
    await lancar({
      amountCents: 10000,
      description: 'Feira',
      purchaseDate: '2031-01-10',
      paymentDate: '2031-01-10',
      splits: [{ categoryId: id('Mercado'), amountCents: 10000 }],
    })
  })

  it('por competência, a compra conta no mês em que foi feita', async () => {
    const report = await relatorio('start=2031-01&count=3&interval=month&basis=accrual')
    expect(report.body.basis).toBe('accrual')
    expect(linha(report.body, 'expense', 'Alimentação fora')?.values).toEqual([50000, 0, 0])
    expect(linha(report.body, 'expense', 'Mercado')?.values).toEqual([10000, 0, 0])
  })

  it('por caixa, a compra do cartão só conta quando a fatura vence', async () => {
    const report = await relatorio('start=2031-01&count=3&interval=month&basis=cash')
    expect(report.body.basis).toBe('cash')
    // Fechou dia 25: a compra do dia 26 entra na fatura que vence em 05/03
    expect(linha(report.body, 'expense', 'Alimentação fora')?.values).toEqual([0, 0, 50000])
    // Pagamento à vista não muda de lugar
    expect(linha(report.body, 'expense', 'Mercado')?.values).toEqual([10000, 0, 0])
  })

  it('competência continua sendo o padrão', async () => {
    const report = await relatorio('start=2031-01&count=3&interval=month')
    expect(report.body.basis).toBe('accrual')
    expect(linha(report.body, 'expense', 'Alimentação fora')?.values).toEqual([50000, 0, 0])
  })
})

describe('detalhe de um número do relatório', () => {
  beforeAll(async () => {
    await lancar({
      amountCents: 7000,
      description: 'Delivery de sexta',
      purchaseDate: '2031-04-10',
      splits: [{ categoryId: id('Delivery'), amountCents: 7000 }],
    })
    await lancar({
      amountCents: 9000,
      description: 'Almoço',
      purchaseDate: '2031-04-20',
      splits: [{ categoryId: id('Restaurante'), amountCents: 9000 }],
    })
    await lancar({
      amountCents: 4000,
      description: 'Fora do período',
      purchaseDate: '2031-05-02',
      splits: [{ categoryId: id('Restaurante'), amountCents: 4000 }],
    })
    await lancar({
      amountCents: 3000,
      description: 'Sem categoria mesmo',
      purchaseDate: '2031-04-15',
      splits: [{ categoryId: null, amountCents: 3000 }],
    })
    await lancar({
      type: 'income',
      amountCents: 800000,
      description: 'Salário de abril',
      purchaseDate: '2031-04-05',
      splits: [{ categoryId: id('Salário'), amountCents: 800000 }],
    })
  })

  it('a categoria principal traz as subcategorias junto', async () => {
    const lista = await ana.json<Transaction[]>(
      `/api/transactions?from=2031-04-01&to=2031-04-30&categoryId=${id('Alimentação fora')}&type=expense`,
    )
    expect(lista.status).toBe(200)
    expect(lista.body.map((item) => item.description).sort()).toEqual([
      'Almoço',
      'Delivery de sexta',
    ])
  })

  it('a subcategoria traz só o que é dela', async () => {
    const lista = await ana.json<Transaction[]>(
      `/api/transactions?from=2031-04-01&to=2031-04-30&categoryId=${id('Delivery')}`,
    )
    expect(lista.body.map((item) => item.description)).toEqual(['Delivery de sexta'])
  })

  it('o tipo separa entrada de saída', async () => {
    const lista = await ana.json<Transaction[]>(
      '/api/transactions?from=2031-04-01&to=2031-04-30&type=income',
    )
    expect(lista.body.map((item) => item.description)).toEqual(['Salário de abril'])
  })

  it('dá para pedir só os sem categoria', async () => {
    const lista = await ana.json<Transaction[]>(
      '/api/transactions?from=2031-04-01&to=2031-04-30&uncategorized=true',
    )
    expect(lista.body.map((item) => item.description)).toEqual(['Sem categoria mesmo'])
  })

  it('o detalhe do caixa usa a data do pagamento', async () => {
    // A compra de 26/01 no cartão vence em 05/03
    const competencia = await ana.json<Transaction[]>(
      '/api/transactions?from=2031-01-01&to=2031-01-31&basis=accrual&type=expense',
    )
    expect(competencia.body.map((item) => item.description).sort()).toEqual([
      'Feira',
      'Jantar no cartão',
    ])

    const caixa = await ana.json<Transaction[]>(
      '/api/transactions?from=2031-03-01&to=2031-03-31&basis=cash&type=expense',
    )
    expect(caixa.body.map((item) => item.description)).toEqual(['Jantar no cartão'])
  })

  it('não vaza lançamento de outro grupo', async () => {
    const bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
    const lista = await bruno.json<Transaction[]>('/api/transactions?from=2031-04-01&to=2031-04-30')
    expect(lista.body).toEqual([])
  })
})
