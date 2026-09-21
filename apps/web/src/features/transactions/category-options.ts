import {
  type Category,
  type CategoryColor,
  type CategoryIconName,
  categoryStyle,
  type TransactionType,
} from '@bolso/shared'

export type CategoryOption = { value: string; label: string }

/** Categorias do tipo escolhido: a principal e, logo abaixo, as filhas como "Moradia › Aluguel" */
export function categoryOptions(categories: Category[], type: TransactionType): CategoryOption[] {
  return categories
    .filter((category) => !category.parentId && category.kind === type)
    .flatMap((parent) => [
      { value: parent.id, label: parent.name },
      ...categories
        .filter((child) => child.parentId === parent.id)
        .map((child) => ({ value: child.id, label: `${parent.name} › ${child.name}` })),
    ])
}

export type CategoryInfo = { label: string; icon: CategoryIconName; color: CategoryColor }

/** Cada categoria com o caminho completo e o visual da principal (só ela tem ícone e cor) */
export function categoryInfoById(categories: Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const info = new Map<string, CategoryInfo>()
  for (const category of categories) {
    const parent = category.parentId ? byId.get(category.parentId) : undefined
    info.set(category.id, {
      label: parent ? `${parent.name} › ${category.name}` : category.name,
      ...categoryStyle(parent ?? category),
    })
  }
  return info
}
