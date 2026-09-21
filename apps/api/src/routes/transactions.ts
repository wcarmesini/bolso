import { randomUUID } from 'node:crypto'
import {
  addMonthsToDate,
  deleteScopeQuerySchema,
  editScopeQuerySchema,
  monthRange,
  prorate,
  splitInstallments,
  type Transaction,
  type TransactionInput,
  type TransactionSplit,
  transactionFormSchema,
  transactionListQuerySchema,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { categories, transactionSplits, transactions, user } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notify, onInvalid } from '../http'
import { accountCycle, cashFields } from '../statements'

type Row = typeof transactions.$inferSelect
// Dentro de db.transaction(), o "tx" tem a mesma cara do banco
type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>

const toTransaction = (
  row: Row,
  splits: TransactionSplit[],
  createdByName: string,
): Transaction => ({
  id: row.id,
  type: row.type,
  amountCents: row.amountCents,
  description: row.description,
  accountId: row.accountId,
  purchaseDate: row.purchaseDate,
  paymentDate: row.paymentDate,
  splits,
  statementMonth: row.statementMonth,
  installment:
    row.installmentGroupId && row.installmentNumber && row.installmentCount
      ? {
          groupId: row.installmentGroupId,
          number: row.installmentNumber,
          count: row.installmentCount,
        }
      : null,
  createdBy: row.createdBy,
  createdByName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** As categorias das partes precisam ser do grupo e do mesmo tipo do lançamento */
async function assertSplitCategories(db: Executor, groupId: string, values: TransactionInput) {
  const ids = values.splits.flatMap((split) => (split.categoryId ? [split.categoryId] : []))
  if (ids.length === 0) return
  const found = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(inArray(categories.id, ids), eq(categories.groupId, groupId)))
  if (found.length !== new Set(ids).size) {
    throw new HttpError(400, 'Categoria não encontrada.', 'splits')
  }
  if (found.some((category) => category.kind !== values.type)) {
    const expected = values.type === 'expense' ? 'despesa' : 'receita'
    throw new HttpError(400, `Escolha categorias de ${expected}.`, 'splits')
  }
}

/** Mesmas categorias, na mesma proporção, para outro valor (ex.: cada parcela) */
function splitsFor(amountCents: number, splits: TransactionSplit[]): TransactionSplit[] {
  const amounts = prorate(
    amountCents,
    splits.map((split) => split.amountCents),
  )
  return splits
    .map((split, index) => ({ categoryId: split.categoryId, amountCents: amounts[index] ?? 0 }))
    .filter((split) => split.amountCents > 0)
}

async function replaceSplits(
  db: Executor,
  groupId: string,
  transactionId: string,
  splits: TransactionSplit[],
) {
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId))
  await db
    .insert(transactionSplits)
    .values(splits.map((split) => ({ ...split, groupId, transactionId })))
}

export function transactionsRoutes(deps: Deps) {
  const { db } = deps

  /** Junta as partes e o nome de quem lançou a cada linha */
  const present = async (rows: Row[]) => {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const splitRows = await db
      .select()
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, ids))
      .orderBy(desc(transactionSplits.amountCents))
    const splitsById = new Map<string, TransactionSplit[]>()
    for (const split of splitRows) {
      const list = splitsById.get(split.transactionId) ?? []
      list.push({ categoryId: split.categoryId, amountCents: split.amountCents })
      splitsById.set(split.transactionId, list)
    }
    const authorIds = [...new Set(rows.map((row) => row.createdBy))]
    const authors = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, authorIds))
    const nameById = new Map(authors.map((author) => [author.id, author.name]))
    return rows.map((row) =>
      toTransaction(row, splitsById.get(row.id) ?? [], nameById.get(row.createdBy) ?? ''),
    )
  }

  const findOwn = async (groupId: string, id: string) => {
    const [row] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.groupId, groupId)))
      .limit(1)
    if (!row) throw new HttpError(404, 'Lançamento não encontrado.')
    return row
  }

  return (
    new Hono<AppEnv>()
      .get('/', zValidator('query', transactionListQuerySchema, onInvalid), async (c) => {
        const { month, accountId, view } = c.req.valid('query')
        const groupFilter = eq(transactions.groupId, c.var.groupId)

        let where: ReturnType<typeof and>
        if (view === 'statement') {
          // A fatura do cartão que vence no mês: as compras dela podem ser de meses anteriores
          if (!accountId || !month) {
            throw new HttpError(400, 'Informe o cartão e o mês da fatura.', 'accountId')
          }
          where = and(
            groupFilter,
            eq(transactions.accountId, accountId),
            eq(transactions.statementMonth, month),
          )
        } else {
          const range = month ? monthRange(month) : null
          where = and(
            groupFilter,
            accountId ? eq(transactions.accountId, accountId) : undefined,
            range ? gte(transactions.purchaseDate, range.from) : undefined,
            range ? lt(transactions.purchaseDate, range.to) : undefined,
          )
        }

        const rows = await db
          .select()
          .from(transactions)
          .where(where)
          .orderBy(desc(transactions.purchaseDate), desc(transactions.createdAt))
        return c.json(await present(rows))
      })

      // Com parcelas, cria uma linha por mês numa transação só: ou entram todas, ou nenhuma
      .post('/', zValidator('json', transactionFormSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const groupId = c.var.groupId
        await assertSplitCategories(db, groupId, values)
        const cycle = await accountCycle(db, groupId, values.accountId)

        const count = values.installments
        const amounts = splitInstallments(values.amountCents, count)
        const seriesId = count > 1 ? randomUUID() : null

        const created = await db.transaction(async (tx) => {
          const rows: Row[] = []
          for (const [index, amountCents] of amounts.entries()) {
            const purchaseDate = addMonthsToDate(values.purchaseDate, index)
            // Fora do cartão, só a primeira parcela pode já estar paga; as outras ficam a pagar
            const informedPayment = index === 0 ? values.paymentDate : null
            const [row] = await tx
              .insert(transactions)
              .values({
                groupId,
                type: values.type,
                amountCents,
                description: values.description,
                accountId: values.accountId,
                purchaseDate,
                ...cashFields(purchaseDate, informedPayment, cycle),
                installmentGroupId: seriesId,
                installmentNumber: seriesId ? index + 1 : null,
                installmentCount: seriesId ? count : null,
                createdBy: c.var.user.id,
              })
              .returning()
            if (!row) throw new HttpError(500, 'Não foi possível salvar o lançamento.')
            await replaceSplits(tx, groupId, row.id, splitsFor(amountCents, values.splits))
            rows.push(row)
          }
          return rows
        })

        notify(deps, c, 'transactions')
        const [first] = await present(created.slice(0, 1))
        return c.json(first, 201)
      })

      /*
       * scope=one: só este lançamento.
       * scope=all (parcelas): este recebe tudo; as outras parcelas recebem tipo, descrição,
       * conta e categorias (na mesma proporção), mas mantêm o valor e a data delas.
       */
      .patch(
        '/:id',
        zValidator('query', editScopeQuerySchema, onInvalid),
        zValidator('json', transactionFormSchema, onInvalid),
        async (c) => {
          const { scope } = c.req.valid('query')
          const values = c.req.valid('json')
          const groupId = c.var.groupId
          const current = await findOwn(groupId, c.req.param('id'))
          await assertSplitCategories(db, groupId, values)
          const cycle = await accountCycle(db, groupId, values.accountId)

          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(transactions)
              .set({
                type: values.type,
                amountCents: values.amountCents,
                description: values.description,
                accountId: values.accountId,
                purchaseDate: values.purchaseDate,
                ...cashFields(values.purchaseDate, values.paymentDate, cycle),
                updatedAt: new Date(),
              })
              .where(eq(transactions.id, current.id))
              .returning()
            if (!row) throw new HttpError(404, 'Lançamento não encontrado.')
            await replaceSplits(tx, groupId, row.id, values.splits)

            if (scope === 'all' && current.installmentGroupId) {
              const siblings = await tx
                .select()
                .from(transactions)
                .where(
                  and(
                    eq(transactions.groupId, groupId),
                    eq(transactions.installmentGroupId, current.installmentGroupId),
                  ),
                )
              for (const sibling of siblings) {
                if (sibling.id === current.id) continue
                await tx
                  .update(transactions)
                  .set({
                    type: values.type,
                    description: values.description,
                    accountId: values.accountId,
                    ...cashFields(sibling.purchaseDate, sibling.paymentDate, cycle),
                    updatedAt: new Date(),
                  })
                  .where(eq(transactions.id, sibling.id))
                await replaceSplits(
                  tx,
                  groupId,
                  sibling.id,
                  splitsFor(sibling.amountCents, values.splits),
                )
              }
            }
            return row
          })

          notify(deps, c, 'transactions')
          const [result] = await present([updated])
          return c.json(result)
        },
      )

      // scope=one: só este · following: este e as próximas parcelas · all: a série inteira
      .delete('/:id', zValidator('query', deleteScopeQuerySchema, onInvalid), async (c) => {
        const { scope } = c.req.valid('query')
        const current = await findOwn(c.var.groupId, c.req.param('id'))
        const series = current.installmentGroupId

        if (scope === 'one' || !series) {
          await db.delete(transactions).where(eq(transactions.id, current.id))
        } else if (scope === 'following') {
          await db
            .delete(transactions)
            .where(
              and(
                eq(transactions.groupId, c.var.groupId),
                eq(transactions.installmentGroupId, series),
                gte(transactions.installmentNumber, current.installmentNumber ?? 1),
              ),
            )
        } else {
          await db
            .delete(transactions)
            .where(
              and(
                eq(transactions.groupId, c.var.groupId),
                eq(transactions.installmentGroupId, series),
              ),
            )
        }

        notify(deps, c, 'transactions')
        return c.body(null, 204)
      })
  )
}
