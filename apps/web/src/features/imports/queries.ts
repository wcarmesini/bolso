import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getImportHistory, undoImport } from './api'

const chave = ['imports']

export function useImportHistory() {
  return useQuery({ queryKey: chave, queryFn: getImportHistory })
}

export function useUndoImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: undoImport,
    onSuccess: () => {
      // Desfazer mexe em tudo: lançamentos, relatórios e a fila do banco
      for (const key of [chave, ['transactions'], ['reports'], ['bank']]) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}
