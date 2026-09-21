import type {
  BudgetReport,
  CashFlowReport,
  CategoriesReport,
  PeopleReport,
  TransactionType,
} from '@bolso/shared'
import { api } from '@/lib/api-client'

// Os relatórios são somados no servidor: o navegador recebe só os totais, não os lançamentos
export function getCashFlow(year: number) {
  return api<CashFlowReport>(`/reports/cash-flow?year=${year}`)
}

export function getCategoriesReport(month: string, type: TransactionType) {
  return api<CategoriesReport>(`/reports/categories?month=${month}&type=${type}`)
}

export function getBudgetReport(month: string) {
  return api<BudgetReport>(`/reports/budget?month=${month}`)
}

export function getPeopleReport(month: string) {
  return api<PeopleReport>(`/reports/people?month=${month}`)
}
