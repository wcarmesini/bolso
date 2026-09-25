import { z } from 'zod'

export const categoryKinds = ['expense', 'income'] as const
export type CategoryKind = (typeof categoryKinds)[number]

/** Ordem na tela: receitas antes de despesas (ver `transactionTypesInOrder`) */
export const categoryKindsInOrder = ['income', 'expense'] as const satisfies readonly CategoryKind[]

export const isCategoryKind = (value: unknown): value is CategoryKind =>
  value === 'expense' || value === 'income'

export const categoryKindLabels: Record<CategoryKind, string> = {
  expense: 'Despesas',
  income: 'Receitas',
}

/*
 * Cor da categoria: um hex (#rrggbb) escolhido pela pessoa. Era uma lista fechada, e virou
 * livre — a paleta abaixo é só o ponto de partida do seletor e o que o app usa sozinho.
 */
export const categoryColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use uma cor em hexadecimal, como #10b981')
  .transform((value) => value.toLowerCase())
export type CategoryColor = string

export const isCategoryColor = (value: unknown): value is CategoryColor =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)

/** Cores sugeridas, na ordem em que o app as distribui para categorias novas */
export const categoryPalette = [
  '#10b981',
  '#f97316',
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#14b8a6',
  '#ef4444',
  '#ec4899',
  '#71717a',
] as const

export const DEFAULT_CATEGORY_COLOR = '#71717a'

export const categoryIconNames = [
  'shopping-cart',
  'shopping-bag',
  'store',
  'utensils',
  'cooking-pot',
  'salad',
  'pizza',
  'sandwich',
  'drumstick',
  'fish',
  'egg',
  'milk',
  'apple',
  'carrot',
  'croissant',
  'cake-slice',
  'candy',
  'ice-cream-cone',
  'popcorn',
  'coffee',
  'beer',
  'wine',
  'house',
  'bed',
  'sofa',
  'armchair',
  'lamp',
  'blinds',
  'bath',
  'shower-head',
  'washing-machine',
  'refrigerator',
  'microwave',
  'plug',
  'wrench',
  'hammer',
  'paint-roller',
  'key',
  'door-open',
  'trash-2',
  'package',
  'zap',
  'droplet',
  'flame',
  'wifi',
  'phone',
  'smartphone',
  'router',
  'tv',
  'monitor',
  'printer',
  'receipt',
  'file-text',
  'recycle',
  'shield',
  'cloud',
  'globe',
  'car',
  'car-front',
  'car-taxi-front',
  'fuel',
  'circle-parking',
  'bus',
  'train-front',
  'bike',
  'truck',
  'plane',
  'ship',
  'luggage',
  'map-pin',
  'navigation',
  'footprints',
  'heart-pulse',
  'stethoscope',
  'pill',
  'syringe',
  'bandage',
  'hospital',
  'ambulance',
  'cross',
  'glasses',
  'brain',
  'accessibility',
  'dumbbell',
  'activity',
  'graduation-cap',
  'book',
  'book-open',
  'library',
  'school',
  'backpack',
  'bus-front',
  'pencil-ruler',
  'pencil',
  'ruler',
  'briefcase',
  'laptop',
  'presentation',
  'building-2',
  'users',
  'user-round',
  'handshake',
  'id-card',
  'scale',
  'film',
  'music',
  'headphones',
  'gamepad-2',
  'dices',
  'joystick',
  'drama',
  'sticker',
  'party-popper',
  'gift',
  'ticket',
  'palette',
  'camera',
  'guitar',
  'trophy',
  'medal',
  'volleyball',
  'tent',
  'mountain-snow',
  'tree-palm',
  'sun',
  'waves',
  'umbrella',
  'baby',
  'person-standing',
  'mars',
  'venus',
  'users-round',
  'toy-brick',
  'blocks',
  'puzzle',
  'bed-single',
  'heart-handshake',
  'heart',
  'hand-heart',
  'paw-print',
  'dog',
  'cat',
  'bone',
  'shirt',
  'scissors',
  'sparkles',
  'flower-2',
  'leaf',
  'sprout',
  'trees',
  'church',
  'cigarette',
  'smile',
  'banknote',
  'coins',
  'wallet',
  'credit-card',
  'piggy-bank',
  'landmark',
  'hand-coins',
  'dollar-sign',
  'trending-up',
  'trending-down',
  'chart-line',
  'chart-pie',
  'percent',
  'calculator',
  'tag',
  'tags',
  'star',
  'bell',
  'calendar',
  'clock',
  'lock',
  'mail',
  'send',
  'rocket',
  'target',
  'flag',
  'bookmark',
  'lightbulb',
] as const
export type CategoryIconName = (typeof categoryIconNames)[number]

export const isCategoryIcon = (value: unknown): value is CategoryIconName =>
  typeof value === 'string' && (categoryIconNames as readonly string[]).includes(value)

const categoryName = z.string().trim().min(1, 'Informe um nome').max(40, 'Use até 40 caracteres')

// Categoria principal: nome, tipo, ícone e cor
export const categoryFormSchema = z.object({
  name: categoryName,
  kind: z.enum(categoryKinds),
  icon: z.enum(categoryIconNames),
  color: categoryColorSchema,
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
  color: z.string().nullable(),
  /** Posição na lista: quem arrasta uma categoria está mexendo aqui */
  position: z.number().int(),
  createdAt: z.string(),
})
export type Category = z.infer<typeof categorySchema>

/*
 * Uma principal sempre tem ícone e cor; o padrão cobre subcategorias (que herdam da mãe) e
 * qualquer valor que não conheçamos mais — ícone e cor são texto no banco.
 */
export function categoryStyle(category: { icon: string | null; color: string | null }) {
  return {
    icon: isCategoryIcon(category.icon) ? category.icon : ('tag' as CategoryIconName),
    color: isCategoryColor(category.color) ? category.color : DEFAULT_CATEGORY_COLOR,
  }
}

/**
 * Nova ordem de uma lista, na sequência em que deve aparecer. `parentId` só vem quando uma
 * subcategoria mudou de principal (arrastada de um grupo para outro): aí os ids passam a ser
 * as filhas daquela principal, nesta ordem.
 */
export const reorderCategoriesSchema = z.object({
  ids: z.array(z.uuid()).min(1, 'Informe a nova ordem').max(200),
  parentId: z.uuid().optional(),
})
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>

// Categorias com que todo grupo novo começa (a pessoa pode editar ou excluir)
export const defaultCategories: (CategoryFormValues & { subcategories?: string[] })[] = [
  { name: 'Mercado', kind: 'expense', icon: 'shopping-cart', color: '#10b981' },
  {
    name: 'Alimentação fora',
    kind: 'expense',
    icon: 'utensils',
    color: '#f97316',
    subcategories: ['Restaurante', 'Delivery'],
  },
  {
    name: 'Moradia',
    kind: 'expense',
    icon: 'house',
    color: '#0ea5e9',
    subcategories: ['Aluguel', 'Condomínio', 'Manutenção'],
  },
  {
    name: 'Contas da casa',
    kind: 'expense',
    icon: 'zap',
    color: '#f59e0b',
    subcategories: ['Luz', 'Água', 'Internet'],
  },
  {
    name: 'Transporte',
    kind: 'expense',
    icon: 'car',
    color: '#14b8a6',
    subcategories: ['Combustível', 'Aplicativo', 'Transporte público'],
  },
  {
    name: 'Saúde',
    kind: 'expense',
    icon: 'heart-pulse',
    color: '#ef4444',
    subcategories: ['Farmácia', 'Consultas'],
  },
  { name: 'Educação', kind: 'expense', icon: 'graduation-cap', color: '#8b5cf6' },
  { name: 'Lazer', kind: 'expense', icon: 'party-popper', color: '#ec4899' },
  { name: 'Salário', kind: 'income', icon: 'briefcase', color: '#10b981' },
  { name: 'Outras receitas', kind: 'income', icon: 'banknote', color: '#71717a' },
]
