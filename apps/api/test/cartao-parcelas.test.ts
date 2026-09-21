import {
  type Account,
  addMonthsToDate,
  type BudgetReport,
  type CashFlowReport,
  type CategoriesReport,
  type Category,
  type PeopleReport,
  prorate,
  splitInstallments,
  statementDates,
  statementFor,
  type Transaction,
} from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

describe('contas puras: fatura, parcelas e rateio', () => {
  const fecha25vence5 = { closingDay: 25, dueDay: 5 }

  it('compra antes do fechamento cai na fatura que vence no mês seguinte', () => {
    expect(statementFor('2026-09-24', fecha25vence5)).toEqual({
      month: '2026-10',
      closingDate: '2026-09-25',
      dueDate: '2026-10-05',
    })
  })

  it('compra no dia do fechamento já vai para a fatura seguinte', () => {
    expect(statementFor('2026-09-25', fecha25vence5).month).toBe('2026-11')
  })

  it('vencimento depois do fechamento no mesmo mês (fecha 5, vence 15)', () => {
    const ciclo = { closingDay: 5, dueDay: 15 }
    expect(statementFor('2026-09-03', ciclo)).toEqual({
      month: '2026-09',
      closingDate: '2026-09-05',
      dueDate: '2026-09-15',
    })
    expect(statementFor('2026-09-05', ciclo).month).toBe('2026-10')
  })

  it('fechamento dia 31 em fevereiro vira o último dia do mês', () => {
    const ciclo = { closingDay: 31, dueDay: 10 }
    // 28/02 é o "dia 31" de fevereiro de 2026: a compra já vai para o fechamento de março
    expect(statementFor('2026-02-28', ciclo)).toEqual({
      month: '2026-04',
      closingDate: '2026-03-31',
      dueDate: '2026-04-10',
    })
    expect(statementFor('2026-02-27', ciclo).closingDate).toBe('2026-02-28')
  })

  it('acha as datas de uma fatura pelo mês dela', () => {
    expect(statementDates('2026-10', fecha25vence5)).toEqual({
      month: '2026-10',
      closingDate: '2026-09-25',
      dueDate: '2026-10-05',
    })
  })

  it('parcelas somam exatamente o total', () => {
    expect(splitInstallments(10000, 3)).toEqual([3334, 3333, 3333])
    const doze = splitInstallments(99999, 12)
    expect(doze.reduce((a, b) => a + b, 0)).toBe(99999)
  })

  it('rateio proporcional sem perder centavo', () => {
    expect(prorate(12000, [25000, 5000])).toEqual([10000, 2000])
    expect(prorate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(prorate(1, [50, 50]).reduce((a, b) => a + b, 0)).toBe(1)
  })

  it('mesmo dia do mês seguinte, sem passar do fim do mês', () => {
    expect(addMonthsToDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToDate('2026-11-15', 3)).toBe('2027-02-15')
  })
})

let api: TestApi
let ana: TestUser
let cartao: Account
const ids = new Map<string, string>()

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  const categories = await ana.json<Category[]>('/api/categories')
  for (const category of categories.body) ids.set(category.name, category.id)
  const created = await ana.json<Account>('/api/accounts', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Cartão',
      type: 'credit_card',
      initialBalanceCents: 0,
      closingDay: 25,
      dueDay: 5,
      limitCents: 500000,
    }),
  })
  cartao = created.body
})

afterAll(async () => {
  await api.close()
})

const id = (name: string) => {
  const found = ids.get(name)
  if (!found) throw new Error(`Categoria ${name} não existe`)
  return found
}

function lancar(values: Record<string, unknown>) {
  return ana.json<Transaction & { error?: string; field?: string }>('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      type: 'expense',
      description: '',
      accountId: null,
      paymentDate: null,
      ...values,
    }),
  })
}

describe('cartão de crédito', () => {
  it('a compra cai sozinha na fatura certa e é paga no vencimento', async () => {
    const antes = await lancar({
      amountCents: 5000,
      accountId: cartao.id,
      purchaseDate: '2026-09-24',
      paymentDate: '2026-09-24', // ignorada: no cartão, quem manda é a fatura
      splits: [{ categoryId: id('Mercado'), amountCents: 5000 }],
    })
    expect(antes.body.statementMonth).toBe('2026-10')
    expect(antes.body.paymentDate).toBe('2026-10-05')

    const noFechamento = await lancar({
      amountCents: 7000,
      accountId: cartao.id,
      purchaseDate: '2026-09-25',
      splits: [{ categoryId: id('Mercado'), amountCents: 7000 }],
    })
    expect(noFechamento.body.statementMonth).toBe('2026-11')

    const fatura = await ana.json<Transaction[]>(
      `/api/transactions?view=statement&accountId=${cartao.id}&month=2026-10`,
    )
    expect(fatura.body.map((item) => item.amountCents)).toEqual([5000])
  })

  it('mudar o fechamento reorganiza as faturas ainda abertas', async () => {
    const compra = await lancar({
      amountCents: 1000,
      accountId: cartao.id,
      purchaseDate: '2030-12-20',
      splits: [{ categoryId: null, amountCents: 1000 }],
    })
    expect(compra.body.statementMonth).toBe('2031-01')

    await ana.request(`/api/accounts/${cartao.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...cartao, closingDay: 15 }),
    })
    // Dia 20 agora é depois do fechamento (15): vai para a fatura seguinte
    const lista = await ana.json<Transaction[]>('/api/transactions?month=2030-12')
    expect(lista.body[0]?.statementMonth).toBe('2031-02')
    expect(lista.body[0]?.paymentDate).toBe('2031-02-05')

    await ana.request(`/api/accounts/${cartao.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...cartao, closingDay: 25 }),
    })
  })
})

describe('parcelado', () => {
  it('3x no cartão: três lançamentos ligados, um por fatura, somando o total', async () => {
    const primeira = await lancar({
      amountCents: 10000,
      description: 'Fone',
      accountId: cartao.id,
      purchaseDate: '2026-09-24',
      installments: 3,
      splits: [{ categoryId: id('Lazer'), amountCents: 10000 }],
    })
    expect(primeira.status).toBe(201)
    const serie = primeira.body.installment
    expect(serie).toMatchObject({ number: 1, count: 3 })

    const todas: Transaction[] = []
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      const lista = await ana.json<Transaction[]>(`/api/transactions?month=${month}`)
      todas.push(...lista.body.filter((item) => item.installment?.groupId === serie?.groupId))
    }
    expect(todas.map((item) => item.amountCents)).toEqual([3334, 3333, 3333])
    expect(todas.map((item) => item.purchaseDate)).toEqual([
      '2026-09-24',
      '2026-10-24',
      '2026-11-24',
    ])
    expect(todas.map((item) => item.statementMonth)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(todas.map((item) => item.installment?.number)).toEqual([1, 2, 3])
  })

  it('fora do cartão, só a primeira parcela sai paga; as outras ficam a pagar', async () => {
    const primeira = await lancar({
      amountCents: 60000,
      description: 'Curso',
      purchaseDate: '2027-01-10',
      paymentDate: '2027-01-10',
      installments: 2,
      splits: [{ categoryId: id('Educação'), amountCents: 60000 }],
    })
    expect(primeira.body.paymentDate).toBe('2027-01-10')
    const fevereiro = await ana.json<Transaction[]>('/api/transactions?month=2027-02')
    expect(fevereiro.body[0]?.paymentDate).toBeNull()
  })

  it('editar a série muda descrição e categoria de todas, mantendo o valor de cada uma', async () => {
    const primeira = await lancar({
      amountCents: 30000,
      description: 'Geladeira',
      purchaseDate: '2027-03-05',
      installments: 3,
      splits: [{ categoryId: id('Moradia'), amountCents: 30000 }],
    })
    await ana.request(`/api/transactions/${primeira.body.id}?scope=all`, {
      method: 'PATCH',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 10000,
        description: 'Geladeira nova',
        accountId: null,
        purchaseDate: '2027-03-05',
        paymentDate: null,
        splits: [{ categoryId: id('Manutenção'), amountCents: 10000 }],
      }),
    })
    const maio = await ana.json<Transaction[]>('/api/transactions?month=2027-05')
    const terceira = maio.body.find(
      (item) => item.installment?.groupId === primeira.body.installment?.groupId,
    )
    expect(terceira?.description).toBe('Geladeira nova')
    expect(terceira?.amountCents).toBe(10000)
    expect(terceira?.splits).toEqual([{ categoryId: id('Manutenção'), amountCents: 10000 }])
  })

  it('excluir "esta e as próximas" mantém as parcelas anteriores', async () => {
    const primeira = await lancar({
      amountCents: 9000,
      description: 'Academia',
      purchaseDate: '2027-06-01',
      installments: 3,
      splits: [{ categoryId: null, amountCents: 9000 }],
    })
    const julho = await ana.json<Transaction[]>('/api/transactions?month=2027-07')
    const segunda = julho.body.find((item) => item.description === 'Academia')
    const apagou = await ana.request(`/api/transactions/${segunda?.id}?scope=following`, {
      method: 'DELETE',
    })
    expect(apagou.status).toBe(204)

    const restantes: Transaction[] = []
    for (const month of ['2027-06', '2027-07', '2027-08']) {
      const lista = await ana.json<Transaction[]>(`/api/transactions?month=${month}`)
      restantes.push(...lista.body.filter((item) => item.description === 'Academia'))
    }
    expect(restantes.map((item) => item.id)).toEqual([primeira.body.id])
  })
})

describe('dividir em categorias', () => {
  it('guarda as partes e reparte cada parcela na mesma proporção', async () => {
    const primeira = await lancar({
      amountCents: 30000,
      description: 'Atacadão',
      purchaseDate: '2027-09-02',
      installments: 2,
      splits: [
        { categoryId: id('Mercado'), amountCents: 20000 },
        { categoryId: id('Restaurante'), amountCents: 10000 },
      ],
    })
    expect(primeira.body.amountCents).toBe(15000)
    expect(primeira.body.splits).toEqual([
      { categoryId: id('Mercado'), amountCents: 10000 },
      { categoryId: id('Restaurante'), amountCents: 5000 },
    ])
  })

  it('recusa partes que não somam o total', async () => {
    const response = await lancar({
      amountCents: 10000,
      purchaseDate: '2027-09-02',
      splits: [
        { categoryId: id('Mercado'), amountCents: 6000 },
        { categoryId: id('Lazer'), amountCents: 3000 },
      ],
    })
    expect(response.status).toBe(400)
    expect(response.body.field).toBe('splits')
  })

  it('recusa a mesma categoria duas vezes', async () => {
    const response = await lancar({
      amountCents: 10000,
      purchaseDate: '2027-09-02',
      splits: [
        { categoryId: id('Mercado'), amountCents: 5000 },
        { categoryId: id('Mercado'), amountCents: 5000 },
      ],
    })
    expect(response.status).toBe(400)
    expect(response.body.error).toContain('repetida')
  })
})

describe('relatórios', () => {
  // Mês isolado, para os números não se misturarem com os outros testes
  const mes = '2028-04'

  beforeAll(async () => {
    await lancar({
      amountCents: 30000,
      description: 'Supermercado com almoço',
      purchaseDate: `${mes}-03`,
      paymentDate: `${mes}-03`,
      splits: [
        { categoryId: id('Mercado'), amountCents: 24000 },
        { categoryId: id('Restaurante'), amountCents: 6000 },
      ],
    })
    await lancar({
      amountCents: 4000,
      purchaseDate: `${mes}-10`,
      splits: [{ categoryId: id('Delivery'), amountCents: 4000 }],
    })
    await lancar({
      amountCents: 1500,
      purchaseDate: `${mes}-11`,
      splits: [{ categoryId: null, amountCents: 1500 }],
    })
    await lancar({
      type: 'income',
      amountCents: 500000,
      purchaseDate: `${mes}-05`,
      paymentDate: `${mes}-05`,
      splits: [{ categoryId: id('Salário'), amountCents: 500000 }],
    })
    // Compra no cartão em abril, paga no vencimento de maio
    await lancar({
      amountCents: 20000,
      accountId: cartao.id,
      purchaseDate: `${mes}-20`,
      splits: [{ categoryId: id('Lazer'), amountCents: 20000 }],
    })
    await ana.request('/api/budgets', {
      method: 'PUT',
      body: JSON.stringify({ categoryId: id('Mercado'), month: mes, limitCents: 20000 }),
    })
  })

  it('gastos por categoria: partes contam em cada categoria e subcategorias sobem para a principal', async () => {
    const report = await ana.json<CategoriesReport>(`/api/reports/categories?month=${mes}`)
    const byName = new Map(report.body.categories.map((line) => [line.name, line]))
    expect(byName.get('Mercado')?.totalCents).toBe(24000)
    expect(byName.get('Alimentação fora')?.totalCents).toBe(10000)
    expect(byName.get('Alimentação fora')?.children).toEqual([
      { categoryId: id('Restaurante'), name: 'Restaurante', totalCents: 6000 },
      { categoryId: id('Delivery'), name: 'Delivery', totalCents: 4000 },
    ])
    expect(byName.get('Sem categoria')?.totalCents).toBe(1500)
    expect(byName.get('Lazer')?.totalCents).toBe(20000)
    expect(report.body.totalCents).toBe(24000 + 10000 + 1500 + 20000)
    // A primeira é a que mais gastou
    expect(report.body.categories[0]?.name).toBe('Mercado')
  })

  it('orçado × realizado: limite e gasto de cada categoria principal', async () => {
    const report = await ana.json<BudgetReport>(`/api/reports/budget?month=${mes}`)
    const mercado = report.body.lines.find((line) => line.name === 'Mercado')
    expect(mercado).toMatchObject({ limitCents: 20000, spentCents: 24000 })
    const lazer = report.body.lines.find((line) => line.name === 'Lazer')
    expect(lazer).toMatchObject({ limitCents: null, spentCents: 20000 })
    // "Sem categoria" não é categoria: não entra no orçamento
    expect(report.body.lines.some((line) => line.name === 'Sem categoria')).toBe(false)
  })

  it('fluxo de caixa: o cartão entra no mês do vencimento, não no da compra', async () => {
    const report = await ana.json<CashFlowReport>('/api/reports/cash-flow?year=2028')
    const abril = report.body.months.find((item) => item.month === mes)
    const maio = report.body.months.find((item) => item.month === '2028-05')
    expect(report.body.months.length).toBe(12)
    expect(abril).toEqual({ month: mes, incomeCents: 500000, expenseCents: 30000 + 4000 + 1500 })
    expect(maio?.expenseCents).toBe(20000)
  })

  it('gastos por pessoa: quem lançou, com todo o grupo na lista', async () => {
    const report = await ana.json<PeopleReport>(`/api/reports/people?month=${mes}`)
    expect(report.body.people).toEqual([
      {
        userId: expect.any(String),
        name: 'Ana',
        image: null,
        expenseCents: 30000 + 4000 + 1500 + 20000,
        incomeCents: 500000,
        count: 5,
      },
    ])
  })
})
