import {
  type Category,
  type CategoryColor,
  type CategoryIconName,
  categoryStyle,
  type TransactionType,
} from '@bolso/shared'
import { stripAccents } from '@/lib/platform'

export type CategoryLeaf = { id: string; name: string }

/** Uma categoria principal com as subcategorias dela */
export type CategoryBranch = CategoryLeaf & {
  icon: CategoryIconName
  color: CategoryColor
  children: CategoryLeaf[]
}

/** As categorias do tipo escolhido, em árvore: principal e, dentro dela, as subcategorias */
export function categoryTree(categories: Category[], type: TransactionType): CategoryBranch[] {
  return categories
    .filter((category) => !category.parentId && category.kind === type)
    .map((parent) => ({
      id: parent.id,
      name: parent.name,
      ...categoryStyle(parent),
      children: categories
        .filter((child) => child.parentId === parent.id)
        .map((child) => ({ id: child.id, name: child.name })),
    }))
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

/** Busca sem acento e sem maiúsculas: "orcamento" encontra "Orçamento" */
export const searchKey = (text: string) => stripAccents(text).toLowerCase().trim()

export const matches = (name: string, query: string) => searchKey(name).includes(query)

/**
 * Filtra a árvore pela busca. A regra que importa: quando o texto casa com uma subcategoria,
 * a categoria principal dela continua na lista — sem isso, o resultado mostraria "Restaurante"
 * solto, sem dizer que ele pertence a "Alimentação fora".
 */
export function filterTree(tree: CategoryBranch[], query: string): CategoryBranch[] {
  const key = searchKey(query)
  if (!key) return tree
  return tree.flatMap((branch) => {
    if (matches(branch.name, key)) return [branch]
    const children = branch.children.filter((child) => matches(child.name, key))
    return children.length > 0 ? [{ ...branch, children }] : []
  })
}
