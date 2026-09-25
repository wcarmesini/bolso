import {
  type BankConnection,
  type BankItemInfo,
  bankConnectionUpdateSchema,
  bankLinkSchema,
  type ImportPreview,
  type ImportResult,
  importDecisionSchema,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, count, desc, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import { accounts, bankConnections, pendingTransactions } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notFound, notify, onInvalid } from '../http'
import { credenciaisDoGrupo, exigirCredenciais, sincronizar } from '../lib/bank-sync'
import {
  agruparConciliacoes,
  conciliarDividindo,
  criarLancamento,
  criarTransferencia,
  ligarExistente,
} from '../lib/import-apply'
import { type ItemDoLote, registrarLote } from '../lib/import-history'
import { buscarContas, buscarItem, connectToken } from '../lib/pluggy'
import { carregarExistentes, categoriasDe, conciliar } from '../lib/reconcile'
import { accountCycle } from '../statements'

/*
 * Banco conectado (Open Finance, via Pluggy).
 *
 * O segredo do Pluggy fica no servidor. O navegador recebe só um `connectToken`, que abre o
 * widget de conexão e vale meia hora. O que o banco manda para na caixa de entrada e espera
 * aprovação — é o mesmo fluxo de conferência do extrato OFX, com a mesma conciliação.
 */

export function bankRoutes(deps: Deps) {
  const { db, env } = deps

  const daConexao = async (groupId: string, id: string) => {
    const [conexao] = await db
      .select()
      .from(bankConnections)
      .where(and(eq(bankConnections.id, id), eq(bankConnections.groupId, groupId)))
      .limit(1)
    if (!conexao) throw notFound('Conexão')
    return conexao
  }

  /** As conexões do grupo, com o nome da conta do Bolso e quantos esperam aprovação */
  const listar = async (groupId: string): Promise<BankConnection[]> => {
    const rows = await db
      .select({ conexao: bankConnections, accountName: accounts.name })
      .from(bankConnections)
      .innerJoin(accounts, eq(accounts.id, bankConnections.accountId))
      .where(eq(bankConnections.groupId, groupId))
      .orderBy(desc(bankConnections.createdAt))

    const esperando = await db
      .select({ connectionId: pendingTransactions.connectionId, quantos: count() })
      .from(pendingTransactions)
      .where(
        and(eq(pendingTransactions.groupId, groupId), eq(pendingTransactions.status, 'pending')),
      )
      .groupBy(pendingTransactions.connectionId)
    const porConexao = new Map(esperando.map((row) => [row.connectionId, row.quantos]))

    return rows.map(({ conexao, accountName }) => ({
      id: conexao.id,
      itemId: conexao.itemId,
      connectorName: conexao.connectorName,
      connectorImageUrl: conexao.connectorImageUrl,
      status: conexao.status,
      statusMessage: conexao.statusMessage,
      accountId: conexao.accountId,
      accountName,
      externalAccountId: conexao.externalAccountId,
      externalAccountName: conexao.externalAccountName,
      startDate: conexao.startDate,
      lastSyncedAt: conexao.lastSyncedAt?.toISOString() ?? null,
      pendingCount: porConexao.get(conexao.id) ?? 0,
      createdAt: conexao.createdAt.toISOString(),
    }))
  }

  return (
    new Hono<AppEnv>()
      // Estado geral: dá para conectar um banco? quais já estão ligados?
      .get('/', async (c) => {
        const credenciais = await credenciaisDoGrupo(db, env.ENCRYPTION_KEY, c.var.groupId)
        return c.json({
          configured: credenciais !== null,
          connections: await listar(c.var.groupId),
        })
      })

      /*
       * Token do widget. Com `itemId`, abre no modo "arrumar esta conexão": é assim que se
       * resolve senha trocada ou confirmação pedida pelo banco, sem criar uma conexão nova.
       */
      .post(
        '/connect-token',
        zValidator('json', z.object({ itemId: z.string().max(80).optional() }), onInvalid),
        async (c) => {
          const credenciais = await exigirCredenciais(db, env.ENCRYPTION_KEY, c.var.groupId)
          const accessToken = await connectToken(credenciais, c.req.valid('json').itemId)
          return c.json({ accessToken })
        },
      )

      // Assim que o widget fecha: o que essa conexão tem dentro, para ligar às contas do Bolso
      .get('/items/:itemId', async (c) => {
        const credenciais = await exigirCredenciais(db, env.ENCRYPTION_KEY, c.var.groupId)
        const itemId = c.req.param('itemId')
        const item = await buscarItem(credenciais, itemId)
        const contas = await buscarContas(credenciais, itemId)
        const jaLigadas = await db
          .select({ externalAccountId: bankConnections.externalAccountId })
          .from(bankConnections)
          .where(eq(bankConnections.groupId, c.var.groupId))
        const ligadas = new Set(jaLigadas.map((row) => row.externalAccountId))

        const info: BankItemInfo = {
          ...item,
          accounts: contas.map((conta) => ({ ...conta, linked: ligadas.has(conta.id) })),
        }
        return c.json(info)
      })

      // Liga contas do banco a contas do Bolso e já traz a primeira leva para aprovação
      .post('/connections', zValidator('json', bankLinkSchema, onInvalid), async (c) => {
        const groupId = c.var.groupId
        const credenciais = await exigirCredenciais(db, env.ENCRYPTION_KEY, groupId)
        const { itemId, links } = c.req.valid('json')
        const item = await buscarItem(credenciais, itemId)
        const contas = await buscarContas(credenciais, itemId)

        const doGrupo = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(
            and(
              eq(accounts.groupId, groupId),
              inArray(
                accounts.id,
                links.map((link) => link.accountId),
              ),
            ),
          )
        if (doGrupo.length !== new Set(links.map((link) => link.accountId)).size) {
          throw new HttpError(400, 'Conta não encontrada.', 'accountId')
        }

        const criadas = []
        for (const link of links) {
          const conta = contas.find((item) => item.id === link.externalAccountId)
          if (!conta) throw new HttpError(400, 'Essa conta não está mais na conexão.')
          const [criada] = await db
            .insert(bankConnections)
            .values({
              groupId,
              itemId,
              connectorName: item.connectorName,
              connectorImageUrl: item.connectorImageUrl,
              status: item.status,
              statusMessage: item.statusMessage,
              accountId: link.accountId,
              externalAccountId: conta.id,
              externalAccountName: [conta.name, conta.number].filter(Boolean).join(' · '),
              startDate: link.startDate,
              createdBy: c.var.user.id,
            })
            .onConflictDoNothing()
            .returning()
          if (criada) criadas.push(criada)
        }

        // A primeira busca sai na hora: a pessoa acabou de conectar e quer ver algo acontecer
        for (const conexao of criadas) {
          try {
            await sincronizar(db, credenciais, conexao)
          } catch (error) {
            console.error('primeira busca', conexao.itemId, error)
          }
        }

        notify(deps, c, 'bank')
        return c.json(await listar(groupId), 201)
      })

      // Mudou a data de início: o que ficou para trás some da caixa de entrada
      .patch(
        '/connections/:id',
        zValidator('json', bankConnectionUpdateSchema, onInvalid),
        async (c) => {
          const conexao = await daConexao(c.var.groupId, c.req.param('id'))
          const { startDate } = c.req.valid('json')
          await db
            .update(bankConnections)
            .set({ startDate, updatedAt: new Date() })
            .where(eq(bankConnections.id, conexao.id))
          notify(deps, c, 'bank')
          return c.json(await listar(c.var.groupId))
        },
      )

      /*
       * Desligar. Os lançamentos já aprovados ficam onde estão — são lançamentos como
       * qualquer outro. O que some é a conexão e o que ainda esperava aprovação.
       */
      .delete('/connections/:id', async (c) => {
        const conexao = await daConexao(c.var.groupId, c.req.param('id'))
        await db.delete(bankConnections).where(eq(bankConnections.id, conexao.id))
        notify(deps, c, 'bank')
        return c.body(null, 204)
      })

      // "Atualizar agora": a mesma busca que roda sozinha, só que na hora
      .post('/connections/:id/sync', async (c) => {
        const credenciais = await exigirCredenciais(db, env.ENCRYPTION_KEY, c.var.groupId)
        const conexao = await daConexao(c.var.groupId, c.req.param('id'))
        await sincronizar(db, credenciais, conexao)
        notify(deps, c, 'bank')
        return c.json(await listar(c.var.groupId))
      })

      // O que está esperando aprovação nesta conexão, já conciliado com o que existe no Bolso
      .get('/connections/:id/pending', async (c) => {
        const groupId = c.var.groupId
        const conexao = await daConexao(groupId, c.req.param('id'))
        const esperando = await db
          .select()
          .from(pendingTransactions)
          .where(
            and(
              eq(pendingTransactions.connectionId, conexao.id),
              eq(pendingTransactions.status, 'pending'),
            ),
          )
          .orderBy(pendingTransactions.date)

        const linhas = esperando.map((row) => ({
          fitId: row.id,
          date: row.date,
          amountCents: row.amountCents,
          description: row.description,
          kind: row.kind,
          installment:
            row.installmentNumber && row.installmentCount && row.purchaseDate
              ? {
                  number: row.installmentNumber,
                  count: row.installmentCount,
                  purchaseDate: row.purchaseDate,
                }
              : null,
        }))
        const existentes = await carregarExistentes(
          db,
          groupId,
          conexao.accountId,
          linhas,
          'pluggy',
        )
        const nomes = await categoriasDe(
          db,
          existentes.map((row) => row.id),
        )
        const { rows, unmatched, available } = conciliar(linhas, existentes, nomes)
        const datas = linhas.map((linha) => linha.date).sort()

        const preview: ImportPreview = {
          accountNumber: conexao.externalAccountName || null,
          bankNumber: conexao.connectorName || null,
          start: datas[0] ?? null,
          end: datas.at(-1) ?? null,
          rows,
          unmatched,
          available,
          balanceLines: 0,
          /*
           * O banco conectado não manda saldo anterior nem saldo final da janela, então não
           * há conta a fechar como no extrato. A tela esconde a conferência quando é assim.
           */
          check: {
            previousBalanceCents: null,
            movementCents: linhas.reduce((total, linha) => total + linha.amountCents, 0),
            finalBalanceCents: null,
            matches: false,
          },
        }
        return c.json(preview)
      })

      /*
       * Os dispensados. Dispensar resolve a linha, mas não a apaga: às vezes se dispensa por
       * engano, e às vezes vale rever meses depois. Trazer de volta devolve a linha à fila,
       * exatamente como ela chegou do banco.
       */
      .get('/connections/:id/dismissed', async (c) => {
        const conexao = await daConexao(c.var.groupId, c.req.param('id'))
        const rows = await db
          .select()
          .from(pendingTransactions)
          .where(
            and(
              eq(pendingTransactions.connectionId, conexao.id),
              eq(pendingTransactions.status, 'dismissed'),
            ),
          )
          .orderBy(desc(pendingTransactions.date))
          .limit(200)

        return c.json(
          rows.map((row) => ({
            id: row.id,
            date: row.date,
            amountCents: row.amountCents,
            description: row.description,
            kind: row.kind,
            dismissedAt: row.updatedAt.toISOString(),
          })),
        )
      })

      .post('/connections/:id/undismiss', async (c) => {
        const conexao = await daConexao(c.var.groupId, c.req.param('id'))
        const { ids } = await c.req.json<{ ids: string[] }>()
        if (!Array.isArray(ids) || ids.length === 0) {
          throw new HttpError(400, 'Informe o que trazer de volta.')
        }
        await db
          .update(pendingTransactions)
          .set({ status: 'pending', updatedAt: new Date() })
          .where(
            and(
              eq(pendingTransactions.connectionId, conexao.id),
              eq(pendingTransactions.status, 'dismissed'),
              inArray(pendingTransactions.id, ids),
            ),
          )
        notify(deps, c, 'bank')
        return c.body(null, 204)
      })

      // Aprovar: cada linha vira lançamento, gruda num que já existia, ou é dispensada
      .post(
        '/connections/:id/approve',
        zValidator(
          'json',
          z.object({ decisions: z.array(importDecisionSchema).min(1).max(500) }),
          onInvalid,
        ),
        async (c) => {
          const groupId = c.var.groupId
          const conexao = await daConexao(groupId, c.req.param('id'))
          const { decisions } = c.req.valid('json')

          const esperando = await db
            .select()
            .from(pendingTransactions)
            .where(
              and(
                eq(pendingTransactions.connectionId, conexao.id),
                eq(pendingTransactions.status, 'pending'),
                inArray(
                  pendingTransactions.id,
                  decisions.map((decision) => decision.fitId),
                ),
              ),
            )
          const porId = new Map(esperando.map((row) => [row.id, row]))

          const cycle = await accountCycle(db, groupId, conexao.accountId)
          const contexto = {
            groupId,
            accountId: conexao.accountId,
            userId: c.var.user.id,
            cycle,
            origin: 'bank' as const,
            source: 'pluggy' as const,
          }
          const result: ImportResult = { created: 0, linked: 0, transferred: 0, skipped: 0 }
          const itens: ItemDoLote[] = []
          // Duas linhas apontando para o mesmo lançamento: ele vai ser dividido entre elas
          const grupos = agruparConciliacoes(decisions)
          const jaDividido = new Set<string>()

          await db.transaction(async (tx) => {
            for (const decision of decisions) {
              const linha = porId.get(decision.fitId)
              // Outra pessoa do grupo já resolveu esta linha: seguimos com as outras
              if (!linha) continue

              if (decision.action === 'link') {
                if (!decision.transactionId) {
                  throw new HttpError(400, 'Informe o lançamento a conciliar.', 'transactionId')
                }
                const irmas = grupos.get(decision.transactionId) ?? [decision.fitId]

                // Uma compra que o banco cobrou em partes: o lançamento se divide entre elas
                if (irmas.length > 1) {
                  result.linked += 1
                  if (!jaDividido.has(decision.transactionId)) {
                    jaDividido.add(decision.transactionId)
                    const linhas = irmas.flatMap((fitId) => {
                      const irma = porId.get(fitId)
                      return irma ? [irma] : []
                    })
                    const divisao = await conciliarDividindo(
                      tx,
                      contexto,
                      decision.transactionId,
                      linhas,
                    )
                    itens.push({
                      action: 'link',
                      transactionId: decision.transactionId,
                      pendingId: linhas[0]?.id ?? linha.id,
                      externalId: linhas[0]?.externalId ?? linha.externalId,
                      previousAmountCents: divisao.previousAmountCents,
                    })
                    for (const [indice, criada] of divisao.criadas.entries()) {
                      itens.push({
                        action: 'create',
                        transactionId: criada,
                        pendingId: linhas[indice + 1]?.id ?? null,
                        externalId: linhas[indice + 1]?.externalId ?? '',
                      })
                    }
                  }
                } else {
                  await ligarExistente(tx, contexto, decision.transactionId, linha.externalId)
                  itens.push({
                    action: 'link',
                    transactionId: decision.transactionId,
                    pendingId: linha.id,
                    externalId: linha.externalId,
                  })
                  result.linked += 1
                }
              } else if (decision.action === 'transfer') {
                if (!decision.counterAccountId) {
                  throw new HttpError(400, 'Informe a outra conta.', 'counterAccountId')
                }
                const transferGroupId = await criarTransferencia(
                  tx,
                  contexto,
                  linha,
                  decision.counterAccountId,
                )
                itens.push({
                  action: 'transfer',
                  transferGroupId,
                  pendingId: linha.id,
                  externalId: linha.externalId,
                })
                result.transferred += 1
              } else if (decision.action === 'create') {
                const transactionId = await criarLancamento(
                  tx,
                  contexto,
                  linha,
                  decision.categoryId,
                  decision.contactId,
                )
                itens.push({
                  action: 'create',
                  transactionId,
                  pendingId: linha.id,
                  externalId: linha.externalId,
                })
                result.created += 1
              } else {
                itens.push({ action: 'skip', pendingId: linha.id, externalId: linha.externalId })
                result.skipped += 1
              }

              /*
               * A linha fica na tabela, marcada. É o que impede a próxima busca de trazer
               * de volta o que já foi resolvido — inclusive o que a pessoa dispensou.
               */
              await tx
                .update(pendingTransactions)
                .set({
                  status: decision.action === 'skip' ? 'dismissed' : 'done',
                  updatedAt: new Date(),
                })
                .where(eq(pendingTransactions.id, linha.id))
            }

            await registrarLote(
              tx,
              {
                groupId,
                source: 'bank',
                connectionId: conexao.id,
                accountId: conexao.accountId,
                label: conexao.connectorName,
                userId: c.var.user.id,
                totais: result,
              },
              itens,
            )
          })

          notify(deps, c, 'transactions', 'bank', 'imports')
          return c.json(result)
        },
      )
  )
}
