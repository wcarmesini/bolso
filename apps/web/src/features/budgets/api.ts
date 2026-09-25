import type { Budget, BudgetUpsertInput } from '@bolso/shared'
import { api } from '@/lib/api-client'

/** Define o orçamento da categoria deste mês em diante; limitCents nulo tira o orçamento */
export function setBudget(input: BudgetUpsertInput) {
  return api<Budget | null>('/budgets', { method: 'PUT', body: input })
}
