import type { Account, Budget, Category, Me, Transaction } from '@bolso/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApi, listen, type TestApi, type TestUser } from './helpers'

let api: TestApi
let ana: TestUser
let anaGroupId: string

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  const me = await ana.json<Me>('/api/me')
  anaGroupId = me.body.activeGroup?.id ?? ''
})

afterAll(async () => {
  await api.close()
})

/** Id de uma categoria principal pelo nome */
async function categoria(name: string) {
  const categories = await ana.json<Category[]>('/api/categories')
  const found = categories.body.find((category) => category.name === name && !category.parentId)
  if (!found) throw new Error(`Categoria ${name} não existe`)
  return found.id
}

const parte = (categoryId: string | null, amountCents: number) => ({ categoryId, amountCents })

/** Corpo de um lançamento com valores padrão, trocando só o que o teste precisa */
const lancamento = (values: Record<string, unknown>) => ({
  type: 'expense',
  description: '',
  accountId: null,
  purchaseDate: '2026-09-10',
  paymentDate: null,
  ...values,
})

/** Corpo de uma conta com valores padrão */
const novaConta = (values: Record<string, unknown>) => ({
  initialBalanceCents: 0,
  closingDay: null,
  dueDay: null,
  limitCents: null,
  ...values,
})

describe('sessão e grupo', () => {
  it('exige login', async () => {
    const response = await api.app.request('/api/categories')
    expect(response.status).toBe(401)
  })

  it('cria um grupo pessoal com as categorias iniciais no primeiro login', async () => {
    const me = await ana.json<Me>('/api/me')
    expect(me.body.user.name).toBe('Ana')
    expect(me.body.activeGroup?.name).toBe('Meu Bolso')
    expect(me.body.activeGroup?.role).toBe('owner')

    const categories = await ana.json<Category[]>('/api/categories')
    const parents = categories.body.filter((category) => !category.parentId)
    const children = categories.body.filter((category) => category.parentId)
    expect(parents.length).toBe(10)
    expect(children.length).toBeGreaterThan(0)
    // Subcategoria não tem ícone nem cor: herda a aparência da principal
    expect(children.every((child) => child.icon === null && child.color === null)).toBe(true)
  })
})

describe('categorias', () => {
  it('cria, impede nome repetido (ignorando acento e maiúscula) e avisa o grupo', async () => {
    const channel = listen(api.hub, anaGroupId)
    const created = await ana.json<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Pets', kind: 'expense', icon: 'paw-print', color: '#14b8a6' }),
    })
    expect(created.status).toBe(201)
    expect(channel.received).toEqual([
      { type: 'invalidate', resources: ['categories'], actorId: expect.any(String) },
    ])

    const duplicate = await ana.json<{ error: string; field: string }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'PÉTS', kind: 'expense', icon: 'paw-print', color: '#14b8a6' }),
    })
    expect(duplicate.status).toBe(409)
    expect(duplicate.body.field).toBe('name')
    channel.unsubscribe()
  })

  it('aceita o mesmo nome em tipos diferentes (despesa e receita)', async () => {
    const income = await ana.json<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Pets', kind: 'income', icon: 'paw-print', color: '#14b8a6' }),
    })
    expect(income.status).toBe(201)
  })

  it('cria subcategoria, impede repetida entre irmãs e permite igual em outra categoria', async () => {
    const categories = await ana.json<Category[]>('/api/categories')
    const [mercado, moradia] = ['Mercado', 'Moradia'].map((name) =>
      categories.body.find((category) => category.name === name && !category.parentId),
    )

    const created = await ana.json<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hortifrúti', parentId: mercado?.id }),
    })
    expect(created.status).toBe(201)
    expect(created.body.kind).toBe('expense')
    expect(created.body.icon).toBeNull()

    const sibling = await ana.json<{ error: string }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'hortifruti', parentId: mercado?.id }),
    })
    expect(sibling.status).toBe(409)

    const other = await ana.json<Category>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hortifrúti', parentId: moradia?.id }),
    })
    expect(other.status).toBe(201)
  })

  it('mudar o tipo da principal leva as subcategorias junto', async () => {
    const before = await ana.json<Category[]>('/api/categories')
    const moradia = before.body.find(
      (category) => category.name === 'Moradia' && !category.parentId,
    )
    const response = await ana.json<Category>(`/api/categories/${moradia?.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Moradia', kind: 'income', icon: 'house', color: '#0ea5e9' }),
    })
    expect(response.status).toBe(200)

    const after = await ana.json<Category[]>('/api/categories')
    const children = after.body.filter((category) => category.parentId === moradia?.id)
    expect(children.length).toBeGreaterThan(0)
    expect(children.every((child) => child.kind === 'income')).toBe(true)
  })

  it('excluir a principal exclui as subcategorias', async () => {
    const before = await ana.json<Category[]>('/api/categories')
    const contas = before.body.find(
      (category) => category.name === 'Contas da casa' && !category.parentId,
    )
    const childrenBefore = before.body.filter((category) => category.parentId === contas?.id)
    expect(childrenBefore.length).toBe(3)

    const response = await ana.request(`/api/categories/${contas?.id}`, { method: 'DELETE' })
    expect(response.status).toBe(204)

    const after = await ana.json<Category[]>('/api/categories')
    expect(after.body.some((category) => category.id === contas?.id)).toBe(false)
    expect(after.body.some((category) => category.parentId === contas?.id)).toBe(false)
  })
})

describe('contas e lançamentos', () => {
  it('guarda valores em centavos e zera o saldo de cartão de crédito', async () => {
    const conta = await ana.json<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(
        novaConta({ name: 'Nubank', type: 'checking', initialBalanceCents: 123456 }),
      ),
    })
    expect(conta.status).toBe(201)
    expect(conta.body.initialBalanceCents).toBe(123456)
    // Conta que não é cartão não guarda ciclo nem limite, mesmo que venham no pedido
    expect(conta.body.closingDay).toBeNull()

    const cartao = await ana.json<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(
        novaConta({
          name: 'Cartão Nubank',
          type: 'credit_card',
          initialBalanceCents: 999,
          closingDay: 25,
          dueDay: 5,
          limitCents: 500000,
        }),
      ),
    })
    expect(cartao.body.initialBalanceCents).toBe(0)
    expect(cartao.body).toMatchObject({ closingDay: 25, dueDay: 5, limitCents: 500000 })
  })

  it('exige fechamento e vencimento no cartão de crédito', async () => {
    const response = await ana.json<{ error: string; field: string }>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(novaConta({ name: 'Cartão sem ciclo', type: 'credit_card' })),
    })
    expect(response.status).toBe(400)
    expect(response.body.field).toBe('closingDay')
  })

  it('recusa categoria de tipo diferente do lançamento', async () => {
    const salario = await categoria('Salário')
    const response = await ana.json<{ error: string; field: string }>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(lancamento({ amountCents: 5000, splits: [parte(salario, 5000)] })),
    })
    expect(response.status).toBe(400)
    expect(response.body.field).toBe('splits')
    expect(response.body.error).toContain('despesa')
  })

  it('cria lançamento, guarda quem lançou e filtra por mês', async () => {
    const mercado = await categoria('Mercado')
    const created = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify(
        lancamento({
          amountCents: 25000,
          description: 'Compra do mês',
          splits: [parte(mercado, 25000)],
          paymentDate: '2026-10-05',
        }),
      ),
    })
    expect(created.status).toBe(201)
    expect(created.body.createdByName).toBe('Ana')
    expect(created.body.splits).toEqual([{ categoryId: mercado, amountCents: 25000 }])
    expect(created.body.installment).toBeNull()

    const setembro = await ana.json<Transaction[]>('/api/transactions?month=2026-09')
    expect(setembro.body.some((item) => item.id === created.body.id)).toBe(true)
    const agosto = await ana.json<Transaction[]>('/api/transactions?month=2026-08')
    expect(agosto.body.length).toBe(0)
  })
})

describe('orçamentos', () => {
  it('o limite vale do mês em diante até ser trocado', async () => {
    const mercado = await categoria('Mercado')
    const put = (month: string, limitCents: number | null) =>
      ana.json<Budget | null>('/api/budgets', {
        method: 'PUT',
        body: JSON.stringify({ categoryId: mercado, month, limitCents }),
      })

    expect((await put('2026-09', 100000)).body?.limitCents).toBe(100000)
    expect((await put('2026-09', 150000)).body?.limitCents).toBe(150000)

    // Outubro e novembro herdam o de setembro, sem ninguém redigitar
    const novembro = await ana.json<Budget[]>('/api/budgets?month=2026-11')
    expect(novembro.body).toEqual([
      { categoryId: mercado, limitCents: 150000, since: '2026-09', items: [] },
    ])
    // Antes de setembro não havia limite
    const agosto = await ana.json<Budget[]>('/api/budgets?month=2026-08')
    expect(agosto.body).toEqual([])

    // Nulo em dezembro encerra o orçamento dali em diante
    await put('2026-12', null)
    expect((await ana.json<Budget[]>('/api/budgets?month=2027-01')).body).toEqual([])
    expect((await ana.json<Budget[]>('/api/budgets?month=2026-11')).body.length).toBe(1)
  })

  it('aceita orçamento em subcategoria', async () => {
    const categories = await ana.json<Category[]>('/api/categories')
    const sub = categories.body.find((category) => category.parentId)
    const response = await ana.json<Budget>('/api/budgets', {
      method: 'PUT',
      body: JSON.stringify({ categoryId: sub?.id, month: '2026-09', limitCents: 1000 }),
    })
    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({ categoryId: sub?.id, limitCents: 1000 })
  })
})

describe('chaves de API', () => {
  it('nunca devolve a chave inteira e guarda criptografada', async () => {
    const created = await ana.json<{ id: string; secretLast4: string }>('/api/integration-keys', {
      method: 'POST',
      body: JSON.stringify({
        provider: 'openai',
        customProvider: '',
        label: 'Pessoal',
        secret: 'sk-test-1234567890abcd',
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body.secretLast4).toBe('abcd')
    expect(JSON.stringify(created.body)).not.toContain('sk-test')

    const list = await ana.request('/api/integration-keys')
    expect(await list.text()).not.toContain('sk-test')
  })
})
