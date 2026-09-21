import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createIntegrationKey, deleteIntegrationKey, listIntegrationKeys } from './api'

const queryKey = ['integration-keys']

export function useIntegrationKeys() {
  return useQuery({ queryKey, queryFn: listIntegrationKeys })
}

export function useCreateIntegrationKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createIntegrationKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useDeleteIntegrationKey() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteIntegrationKey,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}
