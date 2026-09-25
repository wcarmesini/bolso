import { z } from 'zod'
import { monthSchema } from './transactions'

/*
 * Orçamento de uma categoria — principal ou subcategoria, de saída (limite) ou de entrada
 * (previsão). Vale do mês em que foi definido em diante, até alguém mudar: ninguém precisa
 * redigitar o orçamento todo mês. limitCents nulo = "sem orçamento a partir deste mês".
 *
 * O valor pode ser um número só ou vir **detalhado** em itens ("Salário Débora", "Salário
 * Wilson"). Com itens, o valor do orçamento é a soma deles — os itens são a conta, não um
 * comentário.
 */
export const budgetItemSchema = z.object({
  name: z.string().trim().min(1, 'Informe o que é').max(40, 'Use até 40 caracteres'),
  amountCents: z.number().int().min(1, 'Informe o valor').max(100_000_000_000),
})
export type BudgetItem = z.infer<typeof budgetItemSchema>

export const MAX_BUDGET_ITEMS = 20

export const budgetUpsertSchema = z.object({
  categoryId: z.uuid(),
  month: monthSchema,
  /** Ignorado quando há itens: neste caso o valor é a soma deles */
  limitCents: z.number().int().min(0).max(100_000_000_000).nullable(),
  items: z.array(budgetItemSchema).max(MAX_BUDGET_ITEMS).default([]),
})
export type BudgetUpsertInput = z.infer<typeof budgetUpsertSchema>

/** O orçamento que vale num mês, e desde quando */
export type Budget = {
  categoryId: string
  limitCents: number
  since: string
  items: BudgetItem[]
}

export const budgetListQuerySchema = z.object({ month: monthSchema })

/** Soma dos itens; é ela que vira o valor do orçamento quando há detalhamento */
export const sumItems = (items: BudgetItem[]) =>
  items.reduce((total, item) => total + item.amountCents, 0)
