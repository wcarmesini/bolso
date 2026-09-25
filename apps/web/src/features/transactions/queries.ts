import type { DeleteScope, EditScope, TransactionFormValues } from '@bolso/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTransaction,
  deleteTransaction,
  getTransactionHistory,
  listDeletedTransactions,
  listTransactionSlice,
  listTransactions,
  restoreTransaction,
  type TransactionSlice,
  type TransactionView,
  updateTransaction,
} from './api'

// Uma lista por visão (mês, conta, fatura). O prefixo ['transactions'] recarrega todas de uma
// vez, que é o certo: uma parcela nova aparece em vários meses e em várias faturas.
const viewKey = (view: TransactionView) => ['transactions', view]

export function useTransactions(view: TransactionView) {
  return useQuery({ queryKey: viewKey(view), queryFn: () => listTransactions(view) })
}

/** Os lançamentos por trás de um número do relatório (só busca com o detalhe aberto) */
export function useTransactionSlice(slice: TransactionSlice | null) {
  return useQuery({
    queryKey: ['transactions', 'slice', slice],
    queryFn: () => listTransactionSlice(slice as TransactionSlice),
    enabled: slice !== null,
  })
}

// Lançamento mexe em lista, orçamento e relatórios
function useInvalidateMoney() {
  const queryClient = useQueryClient()
  return () => {
    for (const queryKey of [['transactions'], ['budgets'], ['reports']]) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }
}

export function useSaveTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({
      id,
      values,
      scope = 'one',
    }: {
      id?: string
      values: TransactionFormValues
      scope?: EditScope
    }) => (id ? updateTransaction(id, values, scope) : createTransaction(values)),
    onSuccess: invalidate,
  })
}

export function useDeleteTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: DeleteScope }) => deleteTransaction(id, scope),
    onSuccess: invalidate,
  })
}

/** O rastro de um lançamento: só busca quando alguém abre o histórico */
export function useTransactionHistory(id: string | null) {
  return useQuery({
    queryKey: ['transactions', 'history', id],
    queryFn: () => getTransactionHistory(id as string),
    enabled: id !== null,
  })
}

export function useDeletedTransactions(enabled: boolean) {
  return useQuery({
    queryKey: ['transactions', 'deleted'],
    queryFn: listDeletedTransactions,
    enabled,
  })
}

export function useRestoreTransaction() {
  const invalidate = useInvalidateMoney()
  return useMutation({ mutationFn: restoreTransaction, onSuccess: invalidate })
}
