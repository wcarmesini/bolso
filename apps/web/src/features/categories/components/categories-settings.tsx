import {
  type Category,
  type CategoryKind,
  categoryKindLabels,
  categoryKinds,
  categoryStyle,
  isCategoryKind,
} from '@bolso/shared'
import { Plus, Tags } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { RowActions } from '@/components/row-actions'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useCategories, useDeleteCategory } from '../queries'
import { CategoryBadge } from './category-badge'
import { CategoryFormDialog } from './category-form-dialog'
import { SubcategoryFormDialog } from './subcategory-form-dialog'

// Qual formulário está aberto, e com quais dados
type FormState =
  | { type: 'closed' }
  | { type: 'category'; category: Category | null }
  | { type: 'subcategory'; parent: Category; subcategory: Category | null }

export function CategoriesSettings() {
  const { data: categories = [], isPending, isError } = useCategories()
  const deleteCategory = useDeleteCategory()

  const [kind, setKind] = useState<CategoryKind>('expense')
  const [form, setForm] = useState<FormState>({ type: 'closed' })
  const [deleting, setDeleting] = useState<Category | null>(null)

  const parents = categories.filter((item) => item.parentId === null)
  const childrenOf = (parentId: string) => categories.filter((item) => item.parentId === parentId)
  const visibleParents = parents.filter((item) => item.kind === kind)
  const findParent = (child: Category) => parents.find((item) => item.id === child.parentId)

  const closeForm = (open: boolean) => {
    if (!open) setForm({ type: 'closed' })
  }

  const deletingChildren = deleting ? childrenOf(deleting.id).length : 0

  return (
    <>
      <SectionHeader
        title="Categorias"
        description="Organizam entradas e saídas. Cada categoria pode ter subcategorias."
        action={
          <Button onClick={() => setForm({ type: 'category', category: null })}>
            <Plus />
            Nova categoria
          </Button>
        }
      />

      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[kind]}
        onValueChange={(next) => {
          if (isCategoryKind(next[0])) setKind(next[0])
        }}
      >
        {categoryKinds.map((item) => (
          <ToggleGroupItem key={item} value={item}>
            {categoryKindLabels[item]}
            <span className="text-muted-foreground tabular-nums">
              {parents.filter((parent) => parent.kind === item).length}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar as categorias.</p>
      ) : visibleParents.length === 0 ? (
        <EmptyState
          icon={Tags}
          title={`Nenhuma categoria de ${kind === 'expense' ? 'despesa' : 'receita'}`}
          text="Clique em “Nova categoria” para criar a primeira."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visibleParents.map((parent) => {
            const children = childrenOf(parent.id)
            return (
              <li key={parent.id} className="py-1">
                <div className="group/row relative flex items-center gap-3 py-1.5 pr-2 pl-4">
                  <CategoryBadge {...categoryStyle(parent)} />
                  <span className="min-w-0 truncate font-medium text-sm">{parent.name}</span>
                  <RowActions
                    itemName={parent.name}
                    onEdit={() => setForm({ type: 'category', category: parent })}
                    actions={[
                      {
                        label: 'Nova subcategoria',
                        icon: Plus,
                        onSelect: () => setForm({ type: 'subcategory', parent, subcategory: null }),
                      },
                    ]}
                    onDelete={() => setDeleting(parent)}
                  />
                </div>

                {/* Subcategorias: sem ícone, presas por uma linha fina à categoria principal */}
                {children.length > 0 && (
                  <ul className="mb-1.5 ml-[2.125rem] border-l">
                    {children.map((child) => (
                      <li
                        key={child.id}
                        className="group/row relative flex min-h-9 items-center gap-2 py-0.5 pr-2 pl-[1.8125rem]"
                      >
                        <span className="min-w-0 truncate text-sm">{child.name}</span>
                        <RowActions
                          itemName={child.name}
                          onEdit={() =>
                            setForm({ type: 'subcategory', parent, subcategory: child })
                          }
                          onDelete={() => setDeleting(child)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <CategoryFormDialog
        open={form.type === 'category'}
        onOpenChange={closeForm}
        category={form.type === 'category' ? form.category : null}
        defaultKind={kind}
      />

      <SubcategoryFormDialog
        open={form.type === 'subcategory'}
        onOpenChange={closeForm}
        parent={form.type === 'subcategory' ? form.parent : null}
        subcategory={form.type === 'subcategory' ? form.subcategory : null}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={
          deletingChildren > 0
            ? `Excluir “${deleting?.name ?? ''}” e ${deletingChildren === 1 ? 'a subcategoria' : `as ${deletingChildren} subcategorias`}?`
            : `Excluir “${deleting?.name ?? ''}”?`
        }
        description={
          deleting && findParent(deleting)
            ? `A subcategoria sai de “${findParent(deleting)?.name}”. Esta ação não pode ser desfeita.`
            : deletingChildren > 0
              ? 'A categoria e todas as subcategorias dela saem da lista. Esta ação não pode ser desfeita.'
              : 'A categoria sai da lista. Esta ação não pode ser desfeita.'
        }
        successMessage={deleting?.parentId ? 'Subcategoria excluída' : 'Categoria excluída'}
        onConfirm={async () => {
          if (deleting) await deleteCategory.mutateAsync(deleting.id)
        }}
      />
    </>
  )
}
