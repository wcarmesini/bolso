import type { AccountFormValues } from '@bolso/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createAccount, deleteAccount, listAccounts, updateAccount } from './api'

const queryKey = ['accounts']

export function useAccounts() {
  return useQuery({ queryKey, queryFn: listAccounts })
}

export function useSaveAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: AccountFormValues }) =>
      id ? updateAccount(id, values) : createAccount(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useDeleteAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}
