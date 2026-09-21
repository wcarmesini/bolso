import { z } from 'zod'
import type { CategoryColor, CategoryIconName } from './categories'
import { monthSchema } from './transactions'

export const reportMonthQuerySchema = z.object({ month: monthSchema })
export const reportYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000, 'Ano inválido').max(2100, 'Ano inválido'),
})

/**
 * Fluxo de caixa: pelo dia em que o dinheiro entra ou sai (data do pagamento; no cartão,
 * o vencimento da fatura). O que ainda não tem data de pagamento conta pela data da compra.
 */
export type CashFlowMonth = { month: string; incomeCents: number; expenseCents: number }
export type CashFlowReport = { year: number; months: CashFlowMonth[] }

/** Gastos por categoria no mês (pela data da compra), com as subcategorias dentro da principal */
export type CategoryTotal = {
  /** Nulo = lançamentos sem categoria */
  categoryId: string | null
  name: string
  icon: CategoryIconName | null
  color: CategoryColor | null
  totalCents: number
  children: { categoryId: string; name: string; totalCents: number }[]
}
export type CategoriesReport = { month: string; totalCents: number; categories: CategoryTotal[] }

/** Orçado × realizado: toda categoria principal de despesa com limite ou com gasto no mês */
export type BudgetLine = {
  categoryId: string
  name: string
  icon: CategoryIconName | null
  color: CategoryColor | null
  /** Nulo = sem limite definido */
  limitCents: number | null
  spentCents: number
}
export type BudgetReport = { month: string; lines: BudgetLine[] }

/** Gastos por pessoa: quem lançou, no mês (pela data da compra) */
export type PersonTotal = {
  userId: string
  name: string
  image: string | null
  expenseCents: number
  incomeCents: number
  count: number
}
export type PeopleReport = { month: string; people: PersonTotal[] }
