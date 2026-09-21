import { z } from 'zod'

export const categoryKinds = ['expense', 'income'] as const
export type CategoryKind = (typeof categoryKinds)[number]

export const isCategoryKind = (value: unknown): value is CategoryKind =>
  value === 'expense' || value === 'income'

export const categoryKindLabels: Record<CategoryKind, string> = {
  expense: 'Despesas',
  income: 'Receitas',
}

export const categoryColors = [
  'green',
  'teal',
  'blue',
  'violet',
  'pink',
  'red',
  'orange',
  'amber',
  'slate',
] as const
export type CategoryColor = (typeof categoryColors)[number]

export const categoryIconNames = [
  'shopping-cart',
  'utensils',
  'house',
  'zap',
  'droplet',
  'wifi',
  'car',
  'plane',
  'heart-pulse',
  'dumbbell',
  'graduation-cap',
  'baby',
  'paw-print',
  'shirt',
  'smartphone',
  'film',
  'party-popper',
  'gift',
  'receipt',
  'tag',
  'briefcase',
  'banknote',
  'trending-up',
  'piggy-bank',
] as const
export type CategoryIconName = (typeof categoryIconNames)[number]

const categoryName = z.string().trim().min(1, 'Informe um nome').max(40, 'Use até 40 caracteres')

// Categoria principal: nome, tipo, ícone e cor
export const categoryFormSchema = z.object({
  name: categoryName,
  kind: z.enum(categoryKinds),
  icon: z.enum(categoryIconNames),
  color: z.enum(categoryColors),
})
export type CategoryFormValues = z.infer<typeof categoryFormSchema>

// Subcategoria: só o nome. Tipo, ícone e cor vêm da principal.
export const subcategoryFormSchema = z.object({ name: categoryName })
export type SubcategoryFormValues = z.infer<typeof subcategoryFormSchema>

// Corpo do POST /api/categories: principal (sem parentId) ou subcategoria (com parentId)
export const createCategoryInputSchema = z.union([
  categoryFormSchema.extend({ parentId: z.null().optional() }),
  subcategoryFormSchema.extend({ parentId: z.uuid() }),
])
export type CreateCategoryInput = z.infer<typeof createCategoryInputSchema>

// Corpo do PATCH: principal manda tudo; subcategoria manda só o nome
export const updateCategoryInputSchema = z.union([categoryFormSchema, subcategoryFormSchema])
export type UpdateCategoryInput = z.infer<typeof updateCategoryInputSchema>

/*
 * Formato devolvido pela API. Um único formato para as duas: principal (parentId null, com
 * ícone e cor) e subcategoria (parentId da principal, sem ícone e cor). Só existe um nível.
 */
export const categorySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(categoryKinds),
  parentId: z.string().nullable(),
  icon: z.enum(categoryIconNames).nullable(),
  color: z.enum(categoryColors).nullable(),
  createdAt: z.string(),
})
export type Category = z.infer<typeof categorySchema>

// Uma principal sempre tem ícone e cor; o padrão só cobre dado incompleto
export function categoryStyle(category: Pick<Category, 'icon' | 'color'>) {
  return { icon: category.icon ?? 'tag', color: category.color ?? 'slate' } as const
}

// Categorias com que todo grupo novo começa (a pessoa pode editar ou excluir)
export const defaultCategories: (CategoryFormValues & { subcategories?: string[] })[] = [
  { name: 'Mercado', kind: 'expense', icon: 'shopping-cart', color: 'green' },
  {
    name: 'Alimentação fora',
    kind: 'expense',
    icon: 'utensils',
    color: 'orange',
    subcategories: ['Restaurante', 'Delivery'],
  },
  {
    name: 'Moradia',
    kind: 'expense',
    icon: 'house',
    color: 'blue',
    subcategories: ['Aluguel', 'Condomínio', 'Manutenção'],
  },
  {
    name: 'Contas da casa',
    kind: 'expense',
    icon: 'zap',
    color: 'amber',
    subcategories: ['Luz', 'Água', 'Internet'],
  },
  {
    name: 'Transporte',
    kind: 'expense',
    icon: 'car',
    color: 'teal',
    subcategories: ['Combustível', 'Aplicativo', 'Transporte público'],
  },
  {
    name: 'Saúde',
    kind: 'expense',
    icon: 'heart-pulse',
    color: 'red',
    subcategories: ['Farmácia', 'Consultas'],
  },
  { name: 'Educação', kind: 'expense', icon: 'graduation-cap', color: 'violet' },
  { name: 'Lazer', kind: 'expense', icon: 'party-popper', color: 'pink' },
  { name: 'Salário', kind: 'income', icon: 'briefcase', color: 'green' },
  { name: 'Outras receitas', kind: 'income', icon: 'banknote', color: 'slate' },
]
