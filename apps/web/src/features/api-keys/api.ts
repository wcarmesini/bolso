import type { ApiKey, ApiKeyFormValues, CreatedApiKey } from '@bolso/shared'
import { api } from '@/lib/api-client'

/** As chaves da API do Bolso. A chave inteira só existe na resposta da criação. */
export function listApiKeys() {
  return api<ApiKey[]>('/api-keys')
}

export function createApiKey(values: ApiKeyFormValues) {
  return api<CreatedApiKey>('/api-keys', { method: 'POST', body: values })
}

export function deleteApiKey(id: string) {
  return api<void>(`/api-keys/${id}`, { method: 'DELETE' })
}
