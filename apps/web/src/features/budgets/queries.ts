import type { BudgetUpsertInput } from '@bolso/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setBudget } from './api'

export function useSetBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BudgetUpsertInput) => setBudget(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['budgets'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
