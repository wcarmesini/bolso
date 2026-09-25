import type { TransferFormValues } from '@bolso/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createTransfer, deleteTransfer, updateTransfer } from './api'

// Transferência mexe na lista e nos saldos das duas contas
function useInvalidate() {
  const queryClient = useQueryClient()
  return () => {
    for (const queryKey of [['transactions'], ['accounts'], ['reports']]) {
      void queryClient.invalidateQueries({ queryKey })
    }
  }
}

export function useSaveTransfer() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ groupId, values }: { groupId?: string; values: TransferFormValues }) =>
      groupId ? updateTransfer(groupId, values) : createTransfer(values),
    onSuccess: invalidate,
  })
}

export function useDeleteTransfer() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: deleteTransfer, onSuccess: invalidate })
}
