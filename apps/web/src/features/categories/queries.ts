import type { CategoryFormValues, SubcategoryFormValues } from '@bolso/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  listCategories,
  updateCategory,
  updateSubcategory,
} from './api'

const queryKey = ['categories']

export function useCategories() {
  return useQuery({ queryKey, queryFn: listCategories })
}

export function useSaveCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: CategoryFormValues }) =>
      id ? updateCategory(id, values) : createCategory(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useSaveSubcategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      parentId,
      values,
    }: {
      id?: string
      parentId: string
      values: SubcategoryFormValues
    }) => (id ? updateSubcategory(id, values) : createSubcategory(parentId, values)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}
