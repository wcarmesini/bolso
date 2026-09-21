import type { IntegrationKey, IntegrationKeyFormValues } from '@bolso/shared'
import { api } from '@/lib/api-client'

/*
 * A chave sai do navegador uma única vez, ao ser cadastrada. O servidor guarda criptografada
 * e nunca a devolve: a listagem traz só os 4 últimos caracteres.
 */
export function listIntegrationKeys() {
  return api<IntegrationKey[]>('/integration-keys')
}

export function createIntegrationKey(values: IntegrationKeyFormValues) {
  return api<IntegrationKey>('/integration-keys', { method: 'POST', body: values })
}

export function deleteIntegrationKey(id: string) {
  return api<void>(`/integration-keys/${id}`, { method: 'DELETE' })
}
