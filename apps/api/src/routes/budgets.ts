import { type Budget, budgetListQuerySchema, budgetUpsertSchema, sumItems } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, inArray, lte } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { budgetItems, budgets, categories } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notify, onInvalid } from '../http'
import { formatCents } from '../money'

/**
 * O orçamento que vale no mês para cada categoria: o último definido até aquele mês.
 * Definiu R$ 800 em agosto? Setembro, outubro… também valem R$ 800 até alguém mudar.
 * Um registro com limite nulo encerra o orçamento a partir do mês dele.
 *
 * Vale para categoria principal e para subcategoria, de saída e de entrada.
 */
export async function effectiveBudgets(
  db: Database,
  groupId: string,
  month: string,
): Promise<Budget[]> {
  const rows = await db
    .selectDistinctOn([budgets.categoryId], {
      id: budgets.id,
      categoryId: budgets.categoryId,
      limitCents: budgets.limitCents,
      since: budgets.month,
    })
    .from(budgets)
    .where(and(eq(budgets.groupId, groupId), lte(budgets.month, month)))
    .orderBy(budgets.categoryId, desc(budgets.month))

  const valendo = rows.filter((row) => row.limitCents !== null)
  if (valendo.length === 0) return []

  const itens = await db
    .select()
    .from(budgetItems)
    .where(
      inArray(
        budgetItems.budgetId,
        valendo.map((row) => row.id),
      ),
    )
    .orderBy(budgetItems.position)

  return valendo.map((row) => ({
    categoryId: row.categoryId,
    limitCents: row.limitCents ?? 0,
    since: row.since,
    items: itens
      .filter((item) => item.budgetId === row.id)
      .map((item) => ({ name: item.name, amountCents: item.amountCents })),
  }))
}

export function budgetsRoutes(deps: Deps) {
  const { db } = deps

  return (
    new Hono<AppEnv>()
      .get('/', zValidator('query', budgetListQuerySchema, onInvalid), async (c) => {
        const { month } = c.req.valid('query')
        return c.json(await effectiveBudgets(db, c.var.groupId, month))
      })

      // Define (ou encerra, com limitCents nulo) o orçamento da categoria deste mês em diante
      .put('/', zValidator('json', budgetUpsertSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const groupId = c.var.groupId

        const todas = await db
          .select({ id: categories.id, name: categories.name, parentId: categories.parentId })
          .from(categories)
          .where(eq(categories.groupId, groupId))
        const category = todas.find((item) => item.id === values.categoryId)
        if (!category) throw new HttpError(400, 'Categoria não encontrada.', 'categoryId')

        // Com detalhamento, o valor é a soma dos itens — não o que veio no campo
        const detalhado = values.items.length > 0
        const limitCents = detalhado ? sumItems(values.items) : values.limitCents

        /*
         * Principal e subcategorias precisam fechar: não faz sentido orçar R$ 2.000 em
         * "Delivery" se "Alimentação" inteira tem R$ 1.000. A conta usa o que vale no mês
         * (inclusive o que foi herdado de meses anteriores).
         */
        if (limitCents !== null) {
          const valendo = await effectiveBudgets(db, groupId, values.month)
          const limitePor = new Map(valendo.map((budget) => [budget.categoryId, budget.limitCents]))
          limitePor.set(values.categoryId, limitCents)
          const somaDasFilhas = (parentId: string) =>
            todas
              .filter((item) => item.parentId === parentId)
              .reduce((total, item) => total + (limitePor.get(item.id) ?? 0), 0)

          if (category.parentId) {
            const daPrincipal = limitePor.get(category.parentId)
            const soma = somaDasFilhas(category.parentId)
            if (daPrincipal !== undefined && soma > daPrincipal) {
              const nome =
                todas.find((item) => item.id === category.parentId)?.name ?? 'a principal'
              const cabe = daPrincipal - (soma - limitCents)
              throw new HttpError(
                400,
                `As subcategorias somariam ${formatCents(soma)}, acima dos ${formatCents(daPrincipal)} de ${nome}. Cabe ${formatCents(Math.max(cabe, 0))} aqui.`,
                'limitCents',
              )
            }
          } else {
            const soma = somaDasFilhas(category.id)
            if (soma > limitCents) {
              throw new HttpError(
                400,
                `As subcategorias já somam ${formatCents(soma)}. O orçamento de ${category.name} não pode ser menor.`,
                'limitCents',
              )
            }
          }
        }

        await db.transaction(async (tx) => {
          const [saved] = await tx
            .insert(budgets)
            .values({ groupId, categoryId: values.categoryId, month: values.month, limitCents })
            .onConflictDoUpdate({
              target: [budgets.groupId, budgets.categoryId, budgets.month],
              set: { limitCents, updatedAt: new Date() },
            })
            .returning({ id: budgets.id })
          if (!saved) throw new HttpError(500, 'Não foi possível salvar o orçamento.')

          await tx.delete(budgetItems).where(eq(budgetItems.budgetId, saved.id))
          if (detalhado) {
            await tx.insert(budgetItems).values(
              values.items.map((item, position) => ({
                groupId,
                budgetId: saved.id,
                name: item.name,
                amountCents: item.amountCents,
                position,
              })),
            )
          }
        })
        notify(deps, c, 'budgets')

        const current = await effectiveBudgets(db, groupId, values.month)
        return c.json(current.find((budget) => budget.categoryId === values.categoryId) ?? null)
      })

      // Histórico de uma categoria: em que meses o orçamento mudou
      .get('/:categoryId/history', async (c) => {
        const rows = await db
          .select({ month: budgets.month, limitCents: budgets.limitCents })
          .from(budgets)
          .where(
            and(
              eq(budgets.groupId, c.var.groupId),
              eq(budgets.categoryId, c.req.param('categoryId')),
            ),
          )
          .orderBy(asc(budgets.month))
        return c.json(rows)
      })
  )
}
