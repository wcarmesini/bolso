import type {
  BudgetReport,
  CashFlowReport,
  CategoriesReport,
  MonthlyInterval,
  MonthlyReport,
  NetWorthReport,
  PeopleReport,
  ReportBasis,
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

export type MonthlyView = {
  start: string
  count: number
  interval: MonthlyInterval
  basis: ReportBasis
}

export function getMonthlyReport({ start, count, interval, basis }: MonthlyView) {
  const params = new URLSearchParams({ start, count: String(count), interval, basis })
  return api<MonthlyReport>(`/reports/monthly?${params}`)
}

export type NetWorthView = { start: string; count: number; interval: MonthlyInterval }

/** Evolução patrimonial: o saldo de cada conta ao fim de cada período */
export function getNetWorthReport({ start, count, interval }: NetWorthView) {
  const busca = new URLSearchParams({ start, count: String(count), interval })
  return api<NetWorthReport>(`/reports/net-worth?${busca}`)
}
