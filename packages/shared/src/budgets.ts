import { z } from 'zod'
import { monthSchema } from './transactions'

/*
 * Limite mensal de uma categoria principal. Ele vale do mês em que foi definido em diante,
 * até alguém mudar: ninguém precisa redigitar o orçamento todo mês.
 * limitCents nulo = "sem limite a partir deste mês".
 */
export const budgetUpsertSchema = z.object({
  categoryId: z.uuid(),
  month: monthSchema,
  limitCents: z.number().int().min(0).max(100_000_000_000).nullable(),
})
export type BudgetUpsertInput = z.infer<typeof budgetUpsertSchema>

/** O limite que vale num mês, e desde quando */
export type Budget = { categoryId: string; limitCents: number; since: string }

export const budgetListQuerySchema = z.object({ month: monthSchema })
