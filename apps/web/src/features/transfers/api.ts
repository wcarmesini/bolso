import type { Transaction, TransferFormValues } from '@bolso/shared'
import { api } from '@/lib/api-client'

// Camada única de dados das transferências. A API cria, edita e apaga as duas pernas juntas.
export function createTransfer(values: TransferFormValues) {
  return api<Transaction>('/transfers', { method: 'POST', body: values })
}

export function updateTransfer(groupId: string, values: TransferFormValues) {
  return api<Transaction>(`/transfers/${groupId}`, { method: 'PATCH', body: values })
}

export function deleteTransfer(groupId: string) {
  return api<void>(`/transfers/${groupId}`, { method: 'DELETE' })
}
