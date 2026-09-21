import type { Me } from '@bolso/shared'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api-client'
import { listAuthProviders } from './api'

// Quem está logado, o grupo ativo e os grupos da pessoa
export const meQuery = queryOptions({
  queryKey: ['me'],
  queryFn: () => api<Me>('/me'),
  retry: false,
})

export function useMe() {
  return useQuery(meQuery)
}

// Muda só quando o servidor muda de configuração: não precisa buscar de novo a cada visita
export function useAuthProviders() {
  return useQuery({
    queryKey: ['auth-providers'],
    queryFn: listAuthProviders,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  })
}
