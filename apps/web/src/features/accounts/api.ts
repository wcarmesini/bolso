import type { Account, AccountFormValues } from '@bolso/shared'
import { api } from '@/lib/api-client'

// Camada única de dados das contas: só este arquivo conhece a API
export async function listAccounts() {
  const accounts = await api<Account[]>('/accounts')
  return accounts.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

export function createAccount(values: AccountFormValues) {
  return api<Account>('/accounts', { method: 'POST', body: values })
}

export function updateAccount(id: string, values: AccountFormValues) {
  return api<Account>(`/accounts/${id}`, { method: 'PATCH', body: values })
}

export function deleteAccount(id: string) {
  return api<void>(`/accounts/${id}`, { method: 'DELETE' })
}
