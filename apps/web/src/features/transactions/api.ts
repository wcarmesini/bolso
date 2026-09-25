import type {
  AuditEntry,
  DeleteScope,
  EditScope,
  ReportBasis,
  Transaction,
  TransactionFormValues,
  TransactionType,
} from '@bolso/shared'
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

/**
 * O recorte por trás de um número do relatório: um intervalo de datas, uma categoria
 * (as subcategorias vêm junto) e um tipo, no mesmo regime em que a tabela foi lida.
 */
export type TransactionSlice = {
  from: string
  to: string
  /** Nulo = a linha "Sem categoria" */
  categoryId: string | null
  type: TransactionType
  basis: ReportBasis
}

export function listTransactionSlice({ from, to, categoryId, type, basis }: TransactionSlice) {
  const params = new URLSearchParams({ from, to, type, basis })
  if (categoryId) params.set('categoryId', categoryId)
  else params.set('uncategorized', 'true')
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

/** Quem criou, quem mudou o quê: o rastro de um lançamento */
export function getTransactionHistory(id: string) {
  return api<AuditEntry[]>(`/transactions/${id}/history`)
}

export type DeletedTransaction = {
  id: string
  description: string
  amountCents: number
  type: TransactionType
  purchaseDate: string
  accountId: string | null
  categoryIds: (string | null)[]
  deletedAt: string | null
  deletedByName: string
}

/** A lixeira: o que foi excluído e ainda dá para trazer de volta */
export function listDeletedTransactions() {
  return api<DeletedTransaction[]>('/transactions/deleted')
}

export function restoreTransaction(id: string) {
  return api<void>(`/transactions/${id}/restore`, { method: 'POST' })
}

/** Desfaz a conciliação: o lançamento volta a poder ser editado e excluído */
export function unreconcileTransaction(id: string) {
  return api<void>(`/transactions/${id}/unreconcile`, { method: 'POST' })
}
