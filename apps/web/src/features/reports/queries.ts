import type { TransactionType } from '@bolso/shared'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getBudgetReport, getCashFlow, getCategoriesReport, getPeopleReport } from './api'

// Tudo debaixo de ['reports']: um lançamento novo (de qualquer pessoa) recarrega todos.
// keepPreviousData: ao trocar de mês, os números antigos ficam até os novos chegarem,
// em vez de a tela piscar em branco.
export function useCashFlow(year: number) {
  return useQuery({
    queryKey: ['reports', 'cash-flow', year],
    queryFn: () => getCashFlow(year),
    placeholderData: keepPreviousData,
  })
}

export function useCategoriesReport(month: string, type: TransactionType) {
  return useQuery({
    queryKey: ['reports', 'categories', month, type],
    queryFn: () => getCategoriesReport(month, type),
    placeholderData: keepPreviousData,
  })
}

export function useBudgetReport(month: string) {
  return useQuery({
    queryKey: ['reports', 'budget', month],
    queryFn: () => getBudgetReport(month),
    placeholderData: keepPreviousData,
  })
}

export function usePeopleReport(month: string) {
  return useQuery({
    queryKey: ['reports', 'people', month],
    queryFn: () => getPeopleReport(month),
    placeholderData: keepPreviousData,
  })
}
