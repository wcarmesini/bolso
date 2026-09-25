import type { ImportDecision } from '@bolso/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  approveBankPending,
  getBank,
  getBankPending,
  linkBankAccounts,
  removeBankConnection,
  syncBankConnection,
  updateBankConnection,
} from './api'

const chave = ['bank']

export function useBank() {
  return useQuery({ queryKey: chave, queryFn: getBank })
}

/** A caixa de entrada de uma conexão: recarrega sozinha quando a busca automática traz algo */
export function useBankPending(connectionId: string | null) {
  return useQuery({
    queryKey: [...chave, 'pending', connectionId],
    queryFn: () => getBankPending(connectionId as string),
    enabled: connectionId !== null,
  })
}

function useRecarga() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: chave })
  }
}

export function useLinkBankAccounts() {
  const recarregar = useRecarga()
  return useMutation({ mutationFn: linkBankAccounts, onSuccess: recarregar })
}

export function useSyncBankConnection() {
  const recarregar = useRecarga()
  return useMutation({ mutationFn: syncBankConnection, onSuccess: recarregar })
}

export function useRemoveBankConnection() {
  const recarregar = useRecarga()
  return useMutation({ mutationFn: removeBankConnection, onSuccess: recarregar })
}

export function useUpdateBankConnection() {
  const recarregar = useRecarga()
  return useMutation({
    mutationFn: ({ id, startDate }: { id: string; startDate: string }) =>
      updateBankConnection(id, startDate),
    onSuccess: recarregar,
  })
}

export function useApproveBankPending() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decisions }: { id: string; decisions: ImportDecision[] }) =>
      approveBankPending(id, decisions),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chave })
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
