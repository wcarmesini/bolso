import type { Category, CategoryFormValues, SubcategoryFormValues } from '@bolso/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCategory,
  createSubcategory,
  deleteCategory,
  listCategories,
  reorderCategories,
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

/*
 * Reordenar precisa ser instantâneo: quem arrasta já viu o item no lugar novo. A lista local
 * muda na hora e só depois o servidor confirma; deu errado, ela volta como estava.
 */
export function useReorderCategories() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: reorderCategories,
    onMutate: async ({ ids, parentId }: { ids: string[]; parentId?: string }) => {
      await queryClient.cancelQueries({ queryKey })
      const anterior = queryClient.getQueryData<Category[]>(queryKey)
      if (anterior) {
        const posicao = new Map(ids.map((id, index) => [id, index + 1]))
        const mae = parentId ? anterior.find((item) => item.id === parentId) : undefined
        const ordenada = anterior
          .map((category) =>
            posicao.has(category.id)
              ? {
                  ...category,
                  position: posicao.get(category.id) ?? category.position,
                  // Arrastada para outra principal: já aparece lá, e do tipo dela
                  ...(mae ? { parentId: mae.id, kind: mae.kind } : {}),
                }
              : category,
          )
          .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'))
        queryClient.setQueryData(queryKey, ordenada)
      }
      return { anterior }
    },
    onError: (_error, _variables, context) => {
      if (context?.anterior) queryClient.setQueryData(queryKey, context.anterior)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  })
}

export function useDeleteCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  })
}
