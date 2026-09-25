import type {
  Account,
  ApiKey,
  CreatedApiKey,
  ImportBatch,
  ImportPreview,
  Transaction,
  UndoResult,
} from '@bolso/shared'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bankConnections, pendingTransactions } from '../src/db/schema'
import { createTestApi, type TestApi, type TestUser } from './helpers'

/*
 * Banco conectado e chaves da API.
 *
 * O que vem do Pluggy não é testado contra o Pluggy — as linhas entram direto na caixa de
 * entrada, que é exatamente o estado em que a busca automática as deixa. O que importa aqui
 * é o depois: conciliar, aprovar, dispensar, e nada disso voltar na busca seguinte.
 */

let api: TestApi
let ana: TestUser
let conta: Account
let mercado: string
let groupId: string
let conexaoId: string

const criarConta = (name: string) =>
  ana.json<Account>('/api/accounts', {
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

/** Uma linha esperando aprovação, como a busca no banco deixaria */
async function esperando(
  externalId: string,
  date: string,
  amountCents: number,
  description: string,
) {
  const [linha] = await api.db
    .insert(pendingTransactions)
    .values({
      groupId,
      connectionId: conexaoId,
      accountId: conta.id,
      externalId,
      date,
      amountCents,
      description,
      kind: 'Pix',
    })
    .returning()
  return linha
}

beforeAll(async () => {
  api = await createTestApi()
  ana = await api.signIn('Ana', 'ana@exemplo.com')
  conta = (await criarConta('Conta corrente')).body
  const categorias =
    await ana.json<{ id: string; name: string; parentId: string | null }[]>('/api/categories')
  mercado = categorias.body.find((item) => item.name === 'Mercado' && !item.parentId)?.id ?? ''
  const me = await ana.json<{ activeGroup: { id: string }; user: { id: string } }>('/api/me')
  groupId = me.body.activeGroup.id

  const [conexao] = await api.db
    .insert(bankConnections)
    .values({
      groupId,
      itemId: 'item-teste',
      connectorName: 'Banco de Teste',
      status: 'UPDATED',
      accountId: conta.id,
      externalAccountId: 'conta-do-banco',
      externalAccountName: 'Corrente 1234',
      startDate: '2026-09-01',
      createdBy: me.body.user.id,
    })
    .returning()
  conexaoId = conexao?.id ?? ''
})

afterAll(async () => {
  await api.close()
})

describe('caixa de entrada do banco', () => {
  it('lista o que espera aprovação e sugere o par do que já está lançado', async () => {
    const lancado = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 4500,
        description: 'Feira da semana',
        accountId: conta.id,
        contactId: null,
        purchaseDate: '2026-09-10',
        paymentDate: '2026-09-10',
        notes: '',
        splits: [{ categoryId: mercado, amountCents: 4500 }],
        installments: 1,
      }),
    })
    expect(lancado.status).toBe(201)

    await esperando('p1', '2026-09-10', -4500, 'MERCADO SAO JOSE')
    await esperando('p2', '2026-09-12', -3000, 'FARMACIA')

    const preview = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoId}/pending`)
    expect(preview.status).toBe(200)
    expect(preview.body.rows).toHaveLength(2)

    const comPar = preview.body.rows.find((row) => row.status === 'match')
    expect(comPar?.match?.id).toBe(lancado.body.id)
    expect(preview.body.rows.filter((row) => row.status === 'new')).toHaveLength(1)
  })

  it('aprova, concilia e dispensa — e nada disso volta para a fila', async () => {
    const antes = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoId}/pending`)
    const conciliar = antes.body.rows.find((row) => row.status === 'match')
    const nova = antes.body.rows.find((row) => row.status === 'new')

    const resultado = await ana.json<{ created: number; linked: number; skipped: number }>(
      `/api/bank/connections/${conexaoId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          decisions: [
            {
              fitId: conciliar?.fitId,
              action: 'link',
              transactionId: conciliar?.match?.id,
              categoryId: null,
              contactId: null,
            },
            { fitId: nova?.fitId, action: 'create', categoryId: mercado, contactId: null },
          ],
        }),
      },
    )
    expect(resultado.status).toBe(200)
    expect(resultado.body).toEqual({ created: 1, linked: 1, transferred: 0, skipped: 0 })

    const depois = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoId}/pending`)
    expect(depois.body.rows).toHaveLength(0)

    // O lançamento criado carrega o identificador do banco: é o que impede a repetição
    const lancamentos = await ana.json<Transaction[]>(
      '/api/transactions?from=2026-09-01&to=2026-09-30',
    )
    const criado = lancamentos.body.find((item) => item.description === 'FARMACIA')
    expect(criado?.origin).toBe('bank')
    expect(criado?.externalId).toBe('p2')
  })

  it('dispensar tira da fila sem virar lançamento', async () => {
    const linha = await esperando('p3', '2026-09-15', -999, 'TARIFA')
    const resultado = await ana.json<{ skipped: number }>(
      `/api/bank/connections/${conexaoId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          decisions: [{ fitId: linha?.id, action: 'skip', categoryId: null, contactId: null }],
        }),
      },
    )
    expect(resultado.body.skipped).toBe(1)

    const depois = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoId}/pending`)
    expect(depois.body.rows).toHaveLength(0)

    // Continua na tabela, marcada: é assim que a próxima busca sabe não trazer de volta
    const guardada = await api.db
      .select()
      .from(pendingTransactions)
      .where(eq(pendingTransactions.externalId, 'p3'))
    expect(guardada[0]?.status).toBe('dismissed')
  })

  it('aprova como transferência: o pagamento da fatura não vira despesa', async () => {
    const cartao = await ana.json<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cartão',
        type: 'credit_card',
        initialBalanceCents: 0,
        closingDay: 5,
        dueDay: 15,
        limitCents: 500000,
      }),
    })

    const linha = await esperando('p4', '2026-09-16', -50000, 'PAGAMENTO FATURA CARTAO')
    const resultado = await ana.json<{ transferred: number }>(
      `/api/bank/connections/${conexaoId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          decisions: [
            {
              fitId: linha?.id,
              action: 'transfer',
              counterAccountId: cartao.body.id,
              categoryId: null,
              contactId: null,
            },
          ],
        }),
      },
    )
    expect(resultado.body.transferred).toBe(1)

    const lancamentos = await ana.json<Transaction[]>(
      '/api/transactions?from=2026-09-01&to=2026-09-30',
    )
    const pernas = lancamentos.body.filter((item) => item.description === 'PAGAMENTO FATURA CARTAO')
    expect(pernas).toHaveLength(2)

    // Saiu da conta corrente e entrou no cartão, ligadas pela mesma transferência
    const saida = pernas.find((item) => item.accountId === conta.id)
    const entrada = pernas.find((item) => item.accountId === cartao.body.id)
    expect(saida?.type).toBe('expense')
    expect(entrada?.type).toBe('income')
    expect(saida?.transfer?.groupId).toBe(entrada?.transfer?.groupId)

    // Sem categoria: é isso que a mantém fora dos relatórios e do orçamento
    expect(saida?.splits).toEqual([])

    // Só a perna desta conta carrega o identificador do banco, para não repetir na busca
    expect(saida?.externalId).toBe('p4')
    expect(entrada?.externalId).toBeNull()
  })

  it('sem chave do Pluggy, não dá para conectar um banco', async () => {
    const resposta = await ana.json<{ error: string }>('/api/bank/connect-token', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(resposta.status).toBe(400)
    expect(resposta.body.error).toContain('Pluggy')
  })

  it('a conexão só aparece para quem é do grupo', async () => {
    const bruno = await api.signIn('Bruno', 'bruno@exemplo.com')
    const resposta = await bruno.json<{ error: string }>(
      `/api/bank/connections/${conexaoId}/pending`,
    )
    expect(resposta.status).toBe(404)
  })
})

describe('cartão de crédito conectado', () => {
  it('cada compra cai na fatura do próprio mês, mesmo importando vários de uma vez', async () => {
    const me = await ana.json<{ user: { id: string } }>('/api/me')
    const cartao = await ana.json<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cartão do mês',
        type: 'credit_card',
        initialBalanceCents: 0,
        // Fecha dia 5, vence dia 15: a fatura vence no mesmo mês em que fecha
        closingDay: 5,
        dueDay: 15,
        limitCents: 900000,
      }),
    })

    const [conexaoCartao] = await api.db
      .insert(bankConnections)
      .values({
        groupId,
        itemId: 'item-cartao',
        connectorName: 'Banco de Teste',
        status: 'UPDATED',
        accountId: cartao.body.id,
        externalAccountId: 'cartao-do-banco',
        externalAccountName: 'Cartão final 9999',
        startDate: '2026-06-01',
        createdBy: me.body.user.id,
      })
      .returning()

    // Três meses de compras de uma vez, incluindo os dois lados do fechamento
    const compras = [
      { id: 'c1', data: '2026-06-20', esperado: '2026-07' },
      { id: 'c2', data: '2026-07-04', esperado: '2026-07' },
      { id: 'c3', data: '2026-07-05', esperado: '2026-08' },
      { id: 'c4', data: '2026-08-10', esperado: '2026-09' },
    ]
    await api.db.insert(pendingTransactions).values(
      compras.map((compra) => ({
        groupId,
        connectionId: conexaoCartao?.id as string,
        accountId: cartao.body.id,
        externalId: compra.id,
        date: compra.data,
        amountCents: -10000,
        description: `COMPRA ${compra.id}`,
        kind: 'Compras',
      })),
    )

    const fila = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoCartao?.id}/pending`)
    expect(fila.body.rows).toHaveLength(4)

    const aprovacao = await ana.json<{ created: number }>(
      `/api/bank/connections/${conexaoCartao?.id}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          decisions: fila.body.rows.map((row) => ({
            fitId: row.fitId,
            action: 'create',
            categoryId: mercado,
            contactId: null,
          })),
        }),
      },
    )
    expect(aprovacao.body.created).toBe(4)

    const lancamentos = await ana.json<Transaction[]>(
      '/api/transactions?from=2026-06-01&to=2026-08-31',
    )
    for (const compra of compras) {
      const lancado = lancamentos.body.find((item) => item.description === `COMPRA ${compra.id}`)
      expect([compra.id, lancado?.statementMonth]).toEqual([compra.id, compra.esperado])
    }
  })
})

describe('parcela que vem do banco', () => {
  it('as 10 parcelas são da data da compra e viram uma série só', async () => {
    const me = await ana.json<{ user: { id: string } }>('/api/me')
    const cartao = await ana.json<Account>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cartão parcelado',
        type: 'credit_card',
        initialBalanceCents: 0,
        closingDay: 5,
        dueDay: 15,
        limitCents: 900000,
      }),
    })
    const [conexao] = await api.db
      .insert(bankConnections)
      .values({
        groupId,
        itemId: 'item-parcela',
        connectorName: 'Banco de Teste',
        status: 'UPDATED',
        accountId: cartao.body.id,
        externalAccountId: 'cartao-parcela',
        externalAccountName: 'Cartão 9999',
        startDate: '2026-07-01',
        createdBy: me.body.user.id,
      })
      .returning()

    /*
     * A compra foi em 14/08; a parcela 2 caiu na fatura de setembro. O banco manda o número
     * da parcela e a data da compra — as duas parcelas têm de acabar na mesma série e com a
     * mesma competência.
     */
    const parcela = (numero: number, quando: string) => ({
      groupId,
      connectionId: conexao?.id as string,
      accountId: cartao.body.id,
      externalId: `imuno-${numero}`,
      date: quando,
      amountCents: -12000,
      description: 'IMUNO SAO JOSE BR',
      kind: 'Saúde',
      installmentNumber: numero,
      installmentCount: 10,
      purchaseDate: '2026-08-14',
      merchant: 'Imuno',
    })
    await api.db
      .insert(pendingTransactions)
      .values([parcela(1, '2026-08-14'), parcela(2, '2026-09-14')])

    const fila = await ana.json<ImportPreview>(`/api/bank/connections/${conexao?.id}/pending`)
    const aprovar = await ana.json<{ created: number }>(
      `/api/bank/connections/${conexao?.id}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          decisions: fila.body.rows.map((row) => ({
            fitId: row.fitId,
            action: 'create',
            categoryId: mercado,
            contactId: null,
          })),
        }),
      },
    )
    expect(aprovar.body.created).toBe(2)

    const lancamentos = await ana.json<Transaction[]>(
      '/api/transactions?from=2026-08-01&to=2026-08-31',
    )
    const parcelas = lancamentos.body.filter((item) => item.description === 'IMUNO SAO JOSE BR')

    // As duas pesam no mês da compra, não no mês em que caíram na fatura
    expect(parcelas).toHaveLength(2)
    expect(parcelas.map((item) => item.purchaseDate)).toEqual(['2026-08-14', '2026-08-14'])

    // Mesma série, números certos, e cada uma na sua fatura
    const series = new Set(parcelas.map((item) => item.installment?.groupId))
    expect(series.size).toBe(1)
    expect(parcelas.map((item) => item.installment?.number).sort()).toEqual([1, 2])
    expect(parcelas.map((item) => item.installment?.count)).toEqual([10, 10])
    expect([...new Set(parcelas.map((item) => item.statementMonth))].sort()).toEqual([
      '2026-09',
      '2026-10',
    ])
  })
})

describe('histórico de importações', () => {
  it('registra cada aprovação e sabe voltar atrás', async () => {
    // Um lançamento que já existia, para conciliar, e uma linha nova, para criar
    const jaLancado = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 7000,
        description: 'Almoço',
        accountId: conta.id,
        contactId: null,
        purchaseDate: '2026-09-22',
        paymentDate: '2026-09-22',
        notes: '',
        splits: [{ categoryId: mercado, amountCents: 7000 }],
        installments: 1,
      }),
    })
    await esperando('u1', '2026-09-22', -7000, 'RESTAURANTE')
    await esperando('u2', '2026-09-23', -1500, 'PADARIA')
    await esperando('u3', '2026-09-24', -800, 'TARIFA')

    const fila = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoId}/pending`)
    const conciliar = fila.body.rows.find((row) => row.status === 'match')
    const novas = fila.body.rows.filter((row) => row.status === 'new')

    await ana.json(`/api/bank/connections/${conexaoId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        decisions: [
          {
            fitId: conciliar?.fitId,
            action: 'link',
            transactionId: conciliar?.match?.id,
            categoryId: null,
            contactId: null,
          },
          { fitId: novas[0]?.fitId, action: 'create', categoryId: mercado, contactId: null },
          { fitId: novas[1]?.fitId, action: 'skip', categoryId: null, contactId: null },
        ],
      }),
    })

    const historico = await ana.json<ImportBatch[]>('/api/imports/history')
    expect(historico.status).toBe(200)
    const lote = historico.body[0]
    expect(lote).toMatchObject({ source: 'bank', created: 1, linked: 1, skipped: 1 })
    expect(lote?.undoneAt).toBeNull()

    const volta = await ana.json<UndoResult>(`/api/imports/history/${lote?.id}/undo`, {
      method: 'POST',
    })
    expect(volta.status).toBe(200)
    expect(volta.body).toMatchObject({ removed: 1, unlinked: 1, restored: 3 })

    // O que nasceu da aprovação sumiu; o que já existia continua lá, sem o vínculo do banco
    const lancamentos = await ana.json<Transaction[]>(
      '/api/transactions?from=2026-09-20&to=2026-09-30',
    )
    expect(lancamentos.body.some((item) => item.description === 'PADARIA')).toBe(false)
    const almoco = lancamentos.body.find((item) => item.id === jaLancado.body.id)
    expect(almoco?.externalId).toBeNull()

    // As três linhas voltaram a esperar aprovação, inclusive a que tinha sido dispensada
    const depois = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoId}/pending`)
    expect(depois.body.rows).toHaveLength(3)

    // Desfazer duas vezes não desfaz o dobro
    const denovo = await ana.request(`/api/imports/history/${lote?.id}/undo`, { method: 'POST' })
    expect(denovo.status).toBe(409)
  })
})

describe('uma compra, duas saídas no banco', () => {
  it('divide o lançamento manual entre as duas linhas e sabe desfazer', async () => {
    // A pessoa lançou a compra inteira (R$ 80) e o banco cobrou 50 + 30
    const manual = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 8000,
        description: 'Carne do churrasco',
        accountId: conta.id,
        contactId: null,
        purchaseDate: '2026-09-18',
        paymentDate: '2026-09-18',
        notes: '',
        splits: [{ categoryId: mercado, amountCents: 8000 }],
        installments: 1,
      }),
    })
    const primeira = await esperando('d1', '2026-09-18', -5000, 'ACOUGUE BOM CORTE')
    const segunda = await esperando('d2', '2026-09-18', -3000, 'ACOUGUE BOM CORTE')

    const certo = await ana.json<{ linked: number }>(`/api/bank/connections/${conexaoId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        decisions: [primeira?.id, segunda?.id].map((fitId) => ({
          fitId,
          action: 'link',
          transactionId: manual.body.id,
          categoryId: null,
          contactId: null,
        })),
      }),
    })
    expect(certo.status).toBe(200)
    expect(certo.body.linked).toBe(2)

    // O Bolso passa a mostrar os mesmos dois movimentos do banco
    const lancamentos = await ana.json<Transaction[]>(
      '/api/transactions?from=2026-09-15&to=2026-09-20',
    )
    const partes = lancamentos.body.filter((item) => item.description === 'Carne do churrasco')
    expect(partes.map((item) => item.amountCents).sort((a, b) => a - b)).toEqual([3000, 5000])
    expect(partes.every((item) => item.splits[0]?.categoryId === mercado)).toBe(true)
    expect(partes.map((item) => item.externalId).sort()).toEqual(['d1', 'd2'])
    // A soma continua sendo a compra inteira
    expect(partes.reduce((total, item) => total + item.amountCents, 0)).toBe(8000)

    // Desfazer devolve o lançamento inteiro e some com a parte que nasceu da divisão
    const historico = await ana.json<ImportBatch[]>('/api/imports/history')
    const lote = historico.body[0]
    const volta = await ana.json<UndoResult>(`/api/imports/history/${lote?.id}/undo`, {
      method: 'POST',
    })
    expect(volta.status).toBe(200)

    const depois = await ana.json<Transaction[]>('/api/transactions?from=2026-09-15&to=2026-09-20')
    const voltou = depois.body.filter((item) => item.description === 'Carne do churrasco')
    expect(voltou).toHaveLength(1)
    expect(voltou[0]?.amountCents).toBe(8000)
    expect(voltou[0]?.splits[0]?.amountCents).toBe(8000)
    expect(voltou[0]?.externalId).toBeNull()
  })

  it('recusa quando as partes não somam o valor do lançamento', async () => {
    const manual = await ana.json<Transaction>('/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        type: 'expense',
        amountCents: 9000,
        description: 'Compra que não fecha',
        accountId: conta.id,
        contactId: null,
        purchaseDate: '2026-09-19',
        paymentDate: '2026-09-19',
        notes: '',
        splits: [{ categoryId: mercado, amountCents: 9000 }],
        installments: 1,
      }),
    })
    expect(manual.status).toBe(201)
    const a = await esperando('d3', '2026-09-19', -4000, 'LOJA A')
    const b = await esperando('d4', '2026-09-19', -4000, 'LOJA B')

    const resposta = await ana.json<{ error: string }>(
      `/api/bank/connections/${conexaoId}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({
          decisions: [a?.id, b?.id].map((fitId) => ({
            fitId,
            action: 'link',
            transactionId: manual.body.id,
            categoryId: null,
            contactId: null,
          })),
        }),
      },
    )
    expect(resposta.status).toBe(400)
    expect(resposta.body.error).toContain('somam')

    // Nada foi aplicado: as duas linhas continuam esperando
    const fila = await ana.json<ImportPreview>(`/api/bank/connections/${conexaoId}/pending`)
    expect(
      fila.body.rows.filter((row) => ['LOJA A', 'LOJA B'].includes(row.description)),
    ).toHaveLength(2)
  })
})

describe('chaves da API do Bolso', () => {
  it('entra com a chave, devolve ela inteira uma vez só e respeita a permissão', async () => {
    const criada = await ana.json<CreatedApiKey>('/api/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name: 'Planilha', scope: 'read' }),
    })
    expect(criada.status).toBe(201)
    expect(criada.body.token.startsWith('bolso_')).toBe(true)

    // A listagem nunca traz a chave de volta
    const lista = await ana.request('/api/api-keys')
    expect(await lista.text()).not.toContain(criada.body.token)

    const comChave = (init: RequestInit = {}) =>
      api.app.request('/api/transactions?from=2026-09-01&to=2026-09-30', {
        ...init,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${criada.body.token}`,
          ...init.headers,
        },
      })

    expect((await comChave()).status).toBe(200)

    // Chave de leitura não escreve
    const escrita = await api.app.request('/api/accounts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${criada.body.token}`,
      },
      body: JSON.stringify({
        name: 'Não deveria entrar',
        type: 'checking',
        initialBalanceCents: 0,
        closingDay: null,
        dueDay: null,
        limitCents: null,
      }),
    })
    expect(escrita.status).toBe(403)

    // Revogada, para de valer na hora
    const chaves = await ana.json<ApiKey[]>('/api/api-keys')
    const revogar = await ana.request(`/api/api-keys/${chaves.body[0]?.id}`, { method: 'DELETE' })
    expect(revogar.status).toBe(204)
    expect((await comChave()).status).toBe(401)
  })
})
