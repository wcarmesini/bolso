import type { DeleteScope, EditScope, Transaction, TransactionFormValues } from '@bolso/shared'
import { api } from '@/lib/api-client'

/**
 * O que a tela está vendo: as compras de um mês (de todas as contas ou de uma), ou a fatura
 * de um cartão (view "statement": as compras que vencem no mês, feitas em qualquer mês).
 */
export type TransactionView = {
  month: string
  accountId: string | null
  view: 'month' | 'statement'
}

// Camada única de dados dos lançamentos: só este arquivo conhece a API.
// A lista já vem do servidor na ordem certa (data da compra, depois o mais recente).
export function listTransactions({ month, accountId, view }: TransactionView) {
  const params = new URLSearchParams({ month, view })
  if (accountId) params.set('accountId', accountId)
  return api<Transaction[]>(`/transactions?${params}`)
}

export function createTransaction(values: TransactionFormValues) {
  return api<Transaction>('/transactions', { method: 'POST', body: values })
}

/** scope "all" numa parcela: descrição, conta e categorias valem para a série inteira */
export function updateTransaction(id: string, values: TransactionFormValues, scope: EditScope) {
  return api<Transaction>(`/transactions/${id}?scope=${scope}`, { method: 'PATCH', body: values })
}

export function deleteTransaction(id: string, scope: DeleteScope) {
  return api<void>(`/transactions/${id}?scope=${scope}`, { method: 'DELETE' })
}
