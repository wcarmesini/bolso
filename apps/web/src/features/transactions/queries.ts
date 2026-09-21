import type { DeleteScope, EditScope, TransactionFormValues } from '@bolso/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  type TransactionView,
  updateTransaction,
} from './api'

// Uma lista por visão (mês, conta, fatura). O prefixo ['transactions'] recarrega todas de uma
// vez, que é o certo: uma parcela nova aparece em vários meses e em várias faturas.
const viewKey = (view: TransactionView) => ['transactions', view]

export function useTransactions(view: TransactionView) {
  return useQuery({ queryKey: viewKey(view), queryFn: () => listTransactions(view) })
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
