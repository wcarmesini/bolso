import type {
  BankConnection,
  BankItemInfo,
  BankLinkValues,
  ImportDecision,
  ImportPreview,
  ImportResult,
} from '@bolso/shared'
import { api } from '@/lib/api-client'

export type BankState = { configured: boolean; connections: BankConnection[] }

/** As conexões do grupo e se já dá para conectar um banco (chave do Pluggy cadastrada) */
export function getBank() {
  return api<BankState>('/bank')
}

/*
 * Token do widget. Vale meia hora e só serve para abrir a tela de conexão — o segredo do
 * Pluggy fica no servidor. Com `itemId`, abre no modo "arrumar esta conexão".
 */
export function createConnectToken(itemId?: string) {
  return api<{ accessToken: string }>('/bank/connect-token', {
    method: 'POST',
    body: itemId ? { itemId } : {},
  })
}

export function getBankItem(itemId: string) {
  return api<BankItemInfo>(`/bank/items/${itemId}`)
}

export function linkBankAccounts(values: BankLinkValues) {
  return api<BankConnection[]>('/bank/connections', { method: 'POST', body: values })
}

export function updateBankConnection(id: string, startDate: string) {
  return api<BankConnection[]>(`/bank/connections/${id}`, { method: 'PATCH', body: { startDate } })
}

export function removeBankConnection(id: string) {
  return api<void>(`/bank/connections/${id}`, { method: 'DELETE' })
}

export function syncBankConnection(id: string) {
  return api<BankConnection[]>(`/bank/connections/${id}/sync`, { method: 'POST' })
}

/** O que está esperando aprovação, já conciliado com o que existe no Bolso */
export function getBankPending(id: string) {
  return api<ImportPreview>(`/bank/connections/${id}/pending`)
}

export function approveBankPending(id: string, decisions: ImportDecision[]) {
  return api<ImportResult>(`/bank/connections/${id}/approve`, {
    method: 'POST',
    body: { decisions },
  })
}
