import { createFileRoute } from '@tanstack/react-router'
import { CategoriesSettings } from '@/features/categories/components/categories-settings'

export const Route = createFileRoute('/_app/ajustes/categorias')({
  component: CategoriesSettings,
})
