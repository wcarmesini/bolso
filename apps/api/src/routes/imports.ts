import {
  type ImportPreview,
  type ImportResult,
  importConfirmSchema,
  importPreviewSchema,
  OfxParseError,
  type OfxStatement,
  parseOfx,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { accounts } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notify, onInvalid } from '../http'
import {
  agruparConciliacoes,
  conciliarDividindo,
  criarLancamento,
  criarTransferencia,
  ligarExistente,
} from '../lib/import-apply'
import { desfazerLote, type ItemDoLote, listarLotes, registrarLote } from '../lib/import-history'
import { carregarExistentes, categoriasDe, conciliar } from '../lib/reconcile'
import { accountCycle } from '../statements'

/*
 * Importar extrato OFX e conciliar.
 *
 * O arquivo vai junto nas duas chamadas: assim os valores vêm sempre do extrato, e não de
 * algo que o navegador possa ter mexido. Quem decide o que é novo, o que parece com algo já
 * lançado e o que já entrou antes é o motor de conciliação, o mesmo que serve ao banco
 * conectado (`lib/reconcile.ts`).
 */

/** "2026-09-14" menos 1 mês → "2026-08-14" (encolhe para o último dia quando o dia não existe) */
function mesesAtras(date: string, quantos: number) {
  if (quantos <= 0) return date
  const [ano, mes, dia] = date.split('-').map(Number)
  const base = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1 - quantos, 1))
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate()
  base.setUTCDate(Math.min(dia ?? 1, ultimo))
  return base.toISOString().slice(0, 10)
}

function lerArquivo(text: string): OfxStatement {
  try {
    return parseOfx(text)
  } catch (error) {
    if (error instanceof OfxParseError) throw new HttpError(400, error.message, 'text')
    throw error
  }
}

async function assertAccount(db: Database, groupId: string, accountId: string) {
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.groupId, groupId)))
    .limit(1)
  if (!account) throw new HttpError(400, 'Conta não encontrada.', 'accountId')
}

export function importsRoutes(deps: Deps) {
  const { db } = deps

  return (
    new Hono<AppEnv>()
      // Lê o arquivo e diz o que é novo, o que parece com algo já lançado e o que já entrou
      .post('/ofx/preview', zValidator('json', importPreviewSchema, onInvalid), async (c) => {
        const { accountId, text } = c.req.valid('json')
        await assertAccount(db, c.var.groupId, accountId)
        const statement = lerArquivo(text)
        const existentes = await carregarExistentes(
          db,
          c.var.groupId,
          accountId,
          statement.transactions,
          'ofx',
        )
        const nomes = await categoriasDe(
          db,
          existentes.map((row) => row.id),
        )
        const { rows, unmatched, available } = conciliar(statement.transactions, existentes, nomes)

        // A conta do extrato: saldo anterior + o que se moveu tem que dar o saldo final
        const movementCents = statement.transactions.reduce(
          (total, item) => total + item.amountCents,
          0,
        )
        const anterior = statement.previousBalanceCents
        const final = statement.balance?.amountCents ?? null

        const preview: ImportPreview = {
          accountNumber: statement.accountNumber,
          bankNumber: statement.bankNumber,
          start: statement.start,
          end: statement.end,
          rows,
          unmatched,
          available,
          balanceLines: statement.balanceLines,
          check: {
            previousBalanceCents: anterior,
            movementCents,
            finalBalanceCents: final,
            matches: anterior !== null && final !== null && anterior + movementCents === final,
          },
        }
        return c.json(preview)
      })

      // Aplica as decisões. O arquivo vem junto de novo: os valores saem dele, não do navegador
      .post('/ofx/confirm', zValidator('json', importConfirmSchema, onInvalid), async (c) => {
        const { accountId, text, label, decisions } = c.req.valid('json')
        const groupId = c.var.groupId
        await assertAccount(db, groupId, accountId)
        const statement = lerArquivo(text)
        const doExtrato = new Map(statement.transactions.map((item) => [item.fitId, item]))
        const cycle = await accountCycle(db, groupId, accountId)
        const contexto = {
          groupId,
          accountId,
          userId: c.var.user.id,
          cycle,
          origin: 'ofx' as const,
          source: 'ofx' as const,
        }

        const result: ImportResult = { created: 0, linked: 0, transferred: 0, skipped: 0 }
        const itens: ItemDoLote[] = []
        // Duas linhas apontando para o mesmo lançamento: ele vai ser dividido entre elas
        const grupos = agruparConciliacoes(decisions)
        const jaDividido = new Set<string>()

        await db.transaction(async (tx) => {
          for (const decision of decisions) {
            const item = doExtrato.get(decision.fitId)
            if (!item) throw new HttpError(400, 'O arquivo não tem uma das linhas enviadas.')
            if (decision.action === 'skip') {
              result.skipped += 1
              continue
            }

            if (decision.action === 'link') {
              if (!decision.transactionId) {
                throw new HttpError(400, 'Informe o lançamento a conciliar.', 'transactionId')
              }
              const irmas = grupos.get(decision.transactionId) ?? [item.fitId]

              // Uma compra que o banco cobrou em partes: o lançamento se divide entre elas
              if (irmas.length > 1) {
                result.linked += 1
                if (jaDividido.has(decision.transactionId)) continue
                jaDividido.add(decision.transactionId)

                const linhas = irmas.map((fitId) => {
                  const irma = doExtrato.get(fitId)
                  if (!irma) throw new HttpError(400, 'O arquivo não tem uma das linhas enviadas.')
                  return { ...irma, externalId: irma.fitId }
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
                  externalId: linhas[0]?.externalId ?? item.fitId,
                  previousAmountCents: divisao.previousAmountCents,
                })
                for (const [indice, criada] of divisao.criadas.entries()) {
                  itens.push({
                    action: 'create',
                    transactionId: criada,
                    externalId: linhas[indice + 1]?.externalId ?? '',
                  })
                }
                continue
              }

              await ligarExistente(tx, contexto, decision.transactionId, item.fitId)
              itens.push({
                action: 'link',
                transactionId: decision.transactionId,
                externalId: item.fitId,
              })
              result.linked += 1
              continue
            }

            if (decision.action === 'transfer') {
              if (!decision.counterAccountId) {
                throw new HttpError(400, 'Informe a outra conta.', 'counterAccountId')
              }
              const transferGroupId = await criarTransferencia(
                tx,
                contexto,
                { ...item, externalId: item.fitId },
                decision.counterAccountId,
              )
              itens.push({ action: 'transfer', transferGroupId, externalId: item.fitId })
              result.transferred += 1
              continue
            }

            const transactionId = await criarLancamento(
              tx,
              contexto,
              {
                ...item,
                externalId: item.fitId,
                installmentNumber: item.parcela?.number ?? null,
                installmentCount: item.parcela?.count ?? null,
                // O OFX não diz quando a compra foi feita: só dá para contar para trás
                purchaseDate: item.parcela ? mesesAtras(item.date, item.parcela.number - 1) : null,
              },
              decision.categoryId,
              decision.contactId,
            )
            itens.push({ action: 'create', transactionId, externalId: item.fitId })
            result.created += 1
          }

          await registrarLote(
            tx,
            {
              groupId,
              source: 'ofx',
              connectionId: null,
              accountId,
              label,
              userId: c.var.user.id,
              totais: result,
            },
            itens,
          )
        })

        notify(deps, c, 'transactions', 'imports')
        return c.json(result)
      })

      // O que já entrou, quando e por quem — e o caminho de volta
      .get('/history', async (c) => c.json(await listarLotes(db, c.var.groupId)))

      .post('/history/:id/undo', async (c) => {
        const resultado = await desfazerLote(db, c.var.groupId, c.req.param('id'))
        notify(deps, c, 'transactions', 'imports', 'bank')
        return c.json(resultado)
      })
  )
}
