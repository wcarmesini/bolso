import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createApiKey, deleteApiKey, listApiKeys } from './api'

const chave = ['api-keys']

export function useApiKeys() {
  return useQuery({ queryKey: chave, queryFn: listApiKeys })
}

export function useCreateApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
  })
}

export function useDeleteApiKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteApiKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
  })
}
