import type { Category, CategoryFormValues, SubcategoryFormValues } from '@bolso/shared'
import { api } from '@/lib/api-client'

// Camada única de dados das categorias: só este arquivo conhece a API.
// Ordena no navegador para respeitar acentos em português ("Água" antes de "Banco").
export async function listCategories() {
  const categories = await api<Category[]>('/categories')
  return categories.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
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

// Exclui também as subcategorias (o servidor cuida disso)
export function deleteCategory(id: string) {
  return api<void>(`/categories/${id}`, { method: 'DELETE' })
}
