import {
  type BudgetLine,
  type CashFlowMonth,
  type CategoriesReport,
  type CategoryTotal,
  categoryStyle,
  formatMonth,
  monthRange,
  type PeopleReport,
  type PersonTotal,
  reportMonthQuerySchema,
  reportYearQuerySchema,
  type TransactionType,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { categories, member, transactionSplits, transactions, user } from '../db/schema'
import { type AppEnv, type Deps, onInvalid } from '../http'
import { effectiveBudgets } from './budgets'

/*
 * Relatórios. Regra de data:
 * - Gastos por categoria, orçamento e por pessoa: pela DATA DA COMPRA (competência),
 *   que é o mês em que o gasto "conta". Parcelas contam cada uma no seu mês.
 * - Fluxo de caixa: pelo dia em que o dinheiro entra ou sai (data do pagamento; no cartão,
 *   o vencimento da fatura). Sem data de pagamento, vale a data da compra.
 * As categorias vêm sempre das partes do lançamento: um lançamento dividido entre
 * Mercado e Casa conta o pedaço certo em cada uma.
 */

const sum = (column: typeof transactionSplits.amountCents | typeof transactions.amountCents) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number)

/** Quanto foi para cada categoria (a de verdade, ainda sem subir para a principal) */
async function totalsByCategory(
  db: Database,
  groupId: string,
  month: string,
  type: TransactionType,
) {
  const range = monthRange(month)
  const rows = await db
    .select({
      categoryId: transactionSplits.categoryId,
      totalCents: sum(transactionSplits.amountCents),
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
    .where(
      and(
        eq(transactions.groupId, groupId),
        eq(transactions.type, type),
        gte(transactions.purchaseDate, range.from),
        lt(transactions.purchaseDate, range.to),
      ),
    )
    .groupBy(transactionSplits.categoryId)
  return new Map(rows.map((row) => [row.categoryId, row.totalCents]))
}

/** Sobe as subcategorias para a principal, guardando o detalhe delas */
async function rollUp(db: Database, groupId: string, totals: Map<string | null, number>) {
  const all = await db.select().from(categories).where(eq(categories.groupId, groupId))
  const byId = new Map(all.map((category) => [category.id, category]))
  const lines = new Map<string | null, CategoryTotal>()

  const lineFor = (topId: string | null) => {
    const existing = lines.get(topId)
    if (existing) return existing
    const top = topId ? byId.get(topId) : undefined
    const line: CategoryTotal = {
      categoryId: topId,
      name: top?.name ?? 'Sem categoria',
      icon: top ? categoryStyle(top).icon : null,
      color: top ? categoryStyle(top).color : null,
      totalCents: 0,
      children: [],
    }
    lines.set(topId, line)
    return line
  }

  for (const [categoryId, totalCents] of totals) {
    const category = categoryId ? byId.get(categoryId) : undefined
    if (category?.parentId) {
      const line = lineFor(category.parentId)
      line.totalCents += totalCents
      line.children.push({ categoryId: category.id, name: category.name, totalCents })
    } else {
      lineFor(category ? category.id : null).totalCents += totalCents
    }
  }

  for (const line of lines.values()) line.children.sort((a, b) => b.totalCents - a.totalCents)
  return { lines: [...lines.values()].sort((a, b) => b.totalCents - a.totalCents), byId }
}

const categoriesQuerySchema = reportMonthQuerySchema.extend({
  type: z.enum(['expense', 'income']).default('expense'),
})

export function reportsRoutes(deps: Deps) {
  const { db } = deps

  return (
    new Hono<AppEnv>()
      .get('/cash-flow', zValidator('query', reportYearQuerySchema, onInvalid), async (c) => {
        const { year } = c.req.valid('query')
        const cashDate = sql`coalesce(${transactions.paymentDate}, ${transactions.purchaseDate})`
        const month = sql<string>`to_char(${cashDate}, 'YYYY-MM')`
        const rows = await db
          .select({ month, type: transactions.type, totalCents: sum(transactions.amountCents) })
          .from(transactions)
          .where(
            and(
              eq(transactions.groupId, c.var.groupId),
              sql`${cashDate} >= ${`${year}-01-01`}::date`,
              sql`${cashDate} < ${`${year + 1}-01-01`}::date`,
            ),
          )
          .groupBy(month, transactions.type)

        const months: CashFlowMonth[] = Array.from({ length: 12 }, (_, index) => ({
          month: formatMonth(year, index + 1),
          incomeCents: 0,
          expenseCents: 0,
        }))
        for (const row of rows) {
          const target = months.find((item) => item.month === row.month)
          if (!target) continue
          if (row.type === 'income') target.incomeCents += row.totalCents
          else target.expenseCents += row.totalCents
        }
        return c.json({ year, months })
      })

      .get('/categories', zValidator('query', categoriesQuerySchema, onInvalid), async (c) => {
        const { month, type } = c.req.valid('query')
        const totals = await totalsByCategory(db, c.var.groupId, month, type)
        const { lines } = await rollUp(db, c.var.groupId, totals)
        const report: CategoriesReport = {
          month,
          totalCents: lines.reduce((total, line) => total + line.totalCents, 0),
          categories: lines,
        }
        return c.json(report)
      })

      // Toda categoria principal de despesa que tem limite ou teve gasto no mês
      .get('/budget', zValidator('query', reportMonthQuerySchema, onInvalid), async (c) => {
        const { month } = c.req.valid('query')
        const [totals, limits] = await Promise.all([
          totalsByCategory(db, c.var.groupId, month, 'expense'),
          effectiveBudgets(db, c.var.groupId, month),
        ])
        const { lines, byId } = await rollUp(db, c.var.groupId, totals)
        const spentById = new Map(lines.map((line) => [line.categoryId, line.totalCents]))
        const limitById = new Map(limits.map((limit) => [limit.categoryId, limit.limitCents]))

        const ids = new Set([
          ...limitById.keys(),
          ...lines.flatMap((line) => line.categoryId ?? []),
        ])
        const budgetLines: BudgetLine[] = [...ids].flatMap((id) => {
          const category = byId.get(id)
          if (!category || category.parentId || category.kind !== 'expense') return []
          return [
            {
              categoryId: id,
              name: category.name,
              ...categoryStyle(category),
              limitCents: limitById.get(id) ?? null,
              spentCents: spentById.get(id) ?? 0,
            },
          ]
        })
        budgetLines.sort((a, b) => b.spentCents - a.spentCents || a.name.localeCompare(b.name))
        return c.json({ month, lines: budgetLines })
      })

      .get('/people', zValidator('query', reportMonthQuerySchema, onInvalid), async (c) => {
        const { month } = c.req.valid('query')
        const range = monthRange(month)
        const rows = await db
          .select({
            userId: transactions.createdBy,
            type: transactions.type,
            totalCents: sum(transactions.amountCents),
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.groupId, c.var.groupId),
              gte(transactions.purchaseDate, range.from),
              lt(transactions.purchaseDate, range.to),
            ),
          )
          .groupBy(transactions.createdBy, transactions.type)

        // Todo mundo do grupo aparece, mesmo sem lançamento; e quem saiu, se lançou no mês
        const members = await db
          .select({ userId: member.userId })
          .from(member)
          .where(eq(member.organizationId, c.var.groupId))
        const userIds = [
          ...new Set([...members.map((row) => row.userId), ...rows.map((row) => row.userId)]),
        ]
        const users = userIds.length
          ? await db
              .select({ id: user.id, name: user.name, image: user.image })
              .from(user)
              .where(inArray(user.id, userIds))
          : []

        const people = new Map<string, PersonTotal>(
          users.map((person) => [
            person.id,
            {
              userId: person.id,
              name: person.name,
              image: person.image ?? null,
              expenseCents: 0,
              incomeCents: 0,
              count: 0,
            },
          ]),
        )
        for (const row of rows) {
          const person = people.get(row.userId)
          if (!person) continue
          if (row.type === 'income') person.incomeCents += row.totalCents
          else person.expenseCents += row.totalCents
          person.count += row.count
        }
        const report: PeopleReport = {
          month,
          people: [...people.values()].sort(
            (a, b) => b.expenseCents - a.expenseCents || a.name.localeCompare(b.name),
          ),
        }
        return c.json(report)
      })
  )
}
