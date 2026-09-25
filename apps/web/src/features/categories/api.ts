import type { Category, CategoryFormValues, SubcategoryFormValues } from '@bolso/shared'
import { api } from '@/lib/api-client'

// Camada única de dados das categorias: só este arquivo conhece a API.
// A lista já vem na ordem certa: a que a pessoa arrastou, com o nome desempatando.
export function listCategories() {
  return api<Category[]>('/categories')
}

export function createCategory(values: CategoryFormValues) {
  return api<Category>('/categories', { method: 'POST', body: values })
}

export function updateCategory(id: string, values: CategoryFormValues) {
  return api<Category>(`/categories/${id}`, { method: 'PATCH', body: values })
}

export function createSubcategory(parentId: string, values: SubcategoryFormValues) {
  return api<Category>('/categories', { method: 'POST', body: { ...values, parentId } })
}

export function updateSubcategory(id: string, values: SubcategoryFormValues) {
  return api<Category>(`/categories/${id}`, { method: 'PATCH', body: values })
}

/**
 * Nova ordem de uma lista (as principais de um tipo, ou as filhas de uma principal).
 * `parentId` vai junto quando uma subcategoria foi arrastada para outra principal.
 */
export function reorderCategories({ ids, parentId }: { ids: string[]; parentId?: string }) {
  return api<void>('/categories/order', { method: 'PUT', body: { ids, parentId } })
}

// Exclui também as subcategorias (o servidor cuida disso)
export function deleteCategory(id: string) {
  return api<void>(`/categories/${id}`, { method: 'DELETE' })
}
