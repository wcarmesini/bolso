import type { Budget, BudgetReport, Category, Transaction } from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser
const ids = new Map<string, string>()

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  const categorias = await ana.json<Category[]>('/api/categories')
  for (const categoria of categorias.body) ids.set(categoria.name, categoria.id)
})

afterAll(async () => {
  await api.close()
})

const id = (nome: string) => {
  const encontrado = ids.get(nome)
  if (!encontrado) throw new Error(`Categoria ${nome} não existe`)
  return encontrado
}

/** O Intl usa espaço fixo entre "R$" e o número; aqui comparamos com espaço comum */
const semNbsp = (texto: string) => texto.replace(/ /g, ' ')

const orcar = (body: Record<string, unknown>) =>
  ana.json<Budget | null>('/api/budgets', { method: 'PUT', body: JSON.stringify(body) })

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

const mes = '2029-05'

describe('orçamento por categoria e por subcategoria', () => {
  it('aceita orçamento em subcategoria, não só na principal', async () => {
    const resposta = await orcar({
      categoryId: id('Restaurante'),
      month: mes,
      limitCents: 30000,
      items: [],
    })
    expect(resposta.status).toBe(200)
    expect(resposta.body).toMatchObject({ categoryId: id('Restaurante'), limitCents: 30000 })
  })

  it('aceita orçamento de entrada (previsão de receita)', async () => {
    const resposta = await orcar({
      categoryId: id('Salário'),
      month: mes,
      limitCents: 0,
      items: [
        { name: 'Salário Débora', amountCents: 500000 },
        { name: 'Salário Wilson', amountCents: 400000 },
      ],
    })
    expect(resposta.status).toBe(200)
    // Com detalhamento, o valor é a soma dos itens — não o que veio no campo
    expect(resposta.body).toMatchObject({ limitCents: 900000 })
    expect(resposta.body?.items).toEqual([
      { name: 'Salário Débora', amountCents: 500000 },
      { name: 'Salário Wilson', amountCents: 400000 },
    ])
  })

  it('trocar o detalhamento substitui os itens antigos', async () => {
    await orcar({
      categoryId: id('Salário'),
      month: mes,
      limitCents: 0,
      items: [{ name: 'Salário Wilson', amountCents: 450000 }],
    })
    const lista = await ana.json<Budget[]>(`/api/budgets?month=${mes}`)
    const salario = lista.body.find((budget) => budget.categoryId === id('Salário'))
    expect(salario?.limitCents).toBe(450000)
    expect(salario?.items).toEqual([{ name: 'Salário Wilson', amountCents: 450000 }])
  })

  it('sem itens, vale o valor digitado, e o detalhamento some', async () => {
    await orcar({ categoryId: id('Salário'), month: mes, limitCents: 700000, items: [] })
    const lista = await ana.json<Budget[]>(`/api/budgets?month=${mes}`)
    const salario = lista.body.find((budget) => budget.categoryId === id('Salário'))
    expect(salario).toMatchObject({ limitCents: 700000, items: [] })
  })

  it('o orçamento vale do mês em diante, com o detalhamento junto', async () => {
    const depois = await ana.json<Budget[]>('/api/budgets?month=2029-08')
    const restaurante = depois.body.find((budget) => budget.categoryId === id('Restaurante'))
    expect(restaurante).toMatchObject({ limitCents: 30000, since: mes })
  })

  it('recusa categoria de outro grupo', async () => {
    const bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
    const dele = await bruno.json<Category[]>('/api/categories')
    const categoriaDele = dele.body.find((item) => item.name === 'Mercado' && !item.parentId)
    const resposta = await orcar({
      categoryId: categoriaDele?.id,
      month: mes,
      limitCents: 1000,
      items: [],
    })
    expect(resposta.status).toBe(400)
  })
})

describe('principal e subcategorias precisam fechar', () => {
  const mesTrava = '2030-03'

  it('recusa subcategoria acima do orçamento da principal', async () => {
    await orcar({
      categoryId: id('Alimentação fora'),
      month: mesTrava,
      limitCents: 100000,
      items: [],
    })
    const resposta = await orcar({
      categoryId: id('Delivery'),
      month: mesTrava,
      limitCents: 200000,
      items: [],
    })
    expect(resposta.status).toBe(400)
    const erro = resposta.body as unknown as { error: string; field: string }
    expect(erro.field).toBe('limitCents')
    expect(semNbsp(erro.error)).toContain('acima dos R$ 1.000,00')
    expect(semNbsp(erro.error)).toContain('Cabe R$ 700,00 aqui')
  })

  it('aceita quando cabe, e passa a recusar o que estoura o que sobrou', async () => {
    const cabe = await orcar({
      categoryId: id('Delivery'),
      month: mesTrava,
      limitCents: 60000,
      items: [],
    })
    expect(cabe.status).toBe(200)

    // Sobram R$ 400 para as outras subcategorias
    const estoura = await orcar({
      categoryId: id('Restaurante'),
      month: mesTrava,
      limitCents: 50000,
      items: [],
    })
    expect(estoura.status).toBe(400)
    expect(semNbsp((estoura.body as unknown as { error: string }).error)).toContain(
      'Cabe R$ 400,00 aqui',
    )

    const ultimo = await orcar({
      categoryId: id('Restaurante'),
      month: mesTrava,
      limitCents: 40000,
      items: [],
    })
    expect(ultimo.status).toBe(200)
  })

  it('recusa baixar a principal abaixo do que já foi orçado nas filhas', async () => {
    const resposta = await orcar({
      categoryId: id('Alimentação fora'),
      month: mesTrava,
      limitCents: 90000,
      items: [],
    })
    expect(resposta.status).toBe(400)
    expect(semNbsp((resposta.body as unknown as { error: string }).error)).toContain(
      'já somam R$ 1.000,00',
    )
  })

  it('sem orçamento na principal, a subcategoria é livre', async () => {
    // Saúde nunca recebeu orçamento: a filha dela não tem teto
    const resposta = await orcar({
      categoryId: id('Farmácia'),
      month: mesTrava,
      limitCents: 500000,
      items: [],
    })
    expect(resposta.status).toBe(200)
  })
})

describe('orçado × realizado com subcategorias', () => {
  beforeAll(async () => {
    // Gastos: um na principal e dois nas subcategorias
    await lancar({
      amountCents: 12000,
      purchaseDate: `${mes}-05`,
      splits: [{ categoryId: id('Alimentação fora'), amountCents: 12000 }],
    })
    await lancar({
      amountCents: 25000,
      purchaseDate: `${mes}-06`,
      splits: [{ categoryId: id('Restaurante'), amountCents: 25000 }],
    })
    await lancar({
      amountCents: 8000,
      purchaseDate: `${mes}-07`,
      splits: [{ categoryId: id('Delivery'), amountCents: 8000 }],
    })
    await lancar({
      type: 'income',
      amountCents: 650000,
      purchaseDate: `${mes}-05`,
      splits: [{ categoryId: id('Salário'), amountCents: 650000 }],
    })
  })

  it('a principal soma as filhas, e cada filha aparece com o próprio orçamento', async () => {
    const report = await ana.json<BudgetReport>(`/api/reports/budget?month=${mes}`)
    const alimentacao = report.body.expense.find((line) => line.name === 'Alimentação fora')
    expect(alimentacao?.spentCents).toBe(12000 + 25000 + 8000)
    // Sem orçamento próprio, a principal vale a soma do que foi orçado nas filhas
    expect(alimentacao?.limitCents).toBe(30000)

    const restaurante = alimentacao?.children.find((child) => child.name === 'Restaurante')
    expect(restaurante).toMatchObject({ limitCents: 30000, spentCents: 25000 })
    const delivery = alimentacao?.children.find((child) => child.name === 'Delivery')
    expect(delivery).toMatchObject({ limitCents: null, spentCents: 8000 })
  })

  it('orçamento próprio da principal manda no total dela', async () => {
    await orcar({ categoryId: id('Alimentação fora'), month: mes, limitCents: 60000, items: [] })
    const report = await ana.json<BudgetReport>(`/api/reports/budget?month=${mes}`)
    const alimentacao = report.body.expense.find((line) => line.name === 'Alimentação fora')
    expect(alimentacao?.limitCents).toBe(60000)
    // A filha continua com o orçamento dela
    expect(alimentacao?.children.find((child) => child.name === 'Restaurante')?.limitCents).toBe(
      30000,
    )
  })

  it('as entradas vêm à parte, com o detalhamento', async () => {
    const report = await ana.json<BudgetReport>(`/api/reports/budget?month=${mes}`)
    const salario = report.body.income.find((line) => line.name === 'Salário')
    expect(salario).toMatchObject({ limitCents: 700000, spentCents: 650000 })
    expect(report.body.expense.some((line) => line.name === 'Salário')).toBe(false)
  })
})
