import { type Budget, budgetListQuerySchema, budgetUpsertSchema } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq, isNull, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { budgets, categories } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notify, onInvalid } from '../http'

/**
 * O limite que vale no mês para cada categoria: o último definido até aquele mês.
 * Definiu R$ 800 em agosto? Setembro, outubro… também valem R$ 800 até alguém mudar.
 * Um registro com limite nulo encerra o orçamento a partir do mês dele.
 */
export async function effectiveBudgets(db: Database, groupId: string, month: string) {
  const rows = await db
    .selectDistinctOn([budgets.categoryId], {
      categoryId: budgets.categoryId,
      limitCents: budgets.limitCents,
      since: budgets.month,
    })
    .from(budgets)
    .where(and(eq(budgets.groupId, groupId), lte(budgets.month, month)))
    .orderBy(budgets.categoryId, desc(budgets.month))
  return rows.flatMap((row): Budget[] =>
    row.limitCents === null ? [] : [{ ...row, limitCents: row.limitCents }],
  )
}

export function budgetsRoutes(deps: Deps) {
  const { db } = deps

  return (
    new Hono<AppEnv>()
      .get('/', zValidator('query', budgetListQuerySchema, onInvalid), async (c) => {
        const { month } = c.req.valid('query')
        return c.json(await effectiveBudgets(db, c.var.groupId, month))
      })

      // Define (ou encerra, com limitCents nulo) o limite da categoria deste mês em diante
      .put('/', zValidator('json', budgetUpsertSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const [category] = await db
          .select({ id: categories.id, kind: categories.kind })
          .from(categories)
          .where(
            and(
              eq(categories.id, values.categoryId),
              eq(categories.groupId, c.var.groupId),
              isNull(categories.parentId),
            ),
          )
          .limit(1)
        if (!category) {
          throw new HttpError(400, 'Orçamentos são por categoria principal.', 'categoryId')
        }
        if (category.kind !== 'expense') {
          throw new HttpError(400, 'Orçamento é só para categorias de despesa.', 'categoryId')
        }

        await db
          .insert(budgets)
          .values({ ...values, groupId: c.var.groupId })
          .onConflictDoUpdate({
            target: [budgets.groupId, budgets.categoryId, budgets.month],
            set: { limitCents: values.limitCents, updatedAt: new Date() },
          })
        notify(deps, c, 'budgets')

        const current = await effectiveBudgets(db, c.var.groupId, values.month)
        const saved = current.find((budget) => budget.categoryId === values.categoryId) ?? null
        return c.json(saved)
      })
  )
}
