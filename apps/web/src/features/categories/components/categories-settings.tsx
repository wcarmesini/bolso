import {
  type Category,
  type CategoryKind,
  categoryKindLabels,
  categoryKinds,
  categoryKindsInOrder,
  categoryStyle,
  isCategoryKind,
} from '@bolso/shared'
import { CornerDownRight, GripVertical, Plus, Tags } from 'lucide-react'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { RowActions } from '@/components/row-actions'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { umDe, useRemembered } from '@/hooks/use-remembered'
import { useCategories, useDeleteCategory, useReorderCategories } from '../queries'
import { type DragZone, useCategoryDrag } from '../use-category-drag'
import { CategoryBadge } from './category-badge'
import { CategoryFormDialog } from './category-form-dialog'
import { MoverParaDentroDialog } from './mover-para-dentro-dialog'
import { SubcategoryFormDialog } from './subcategory-form-dialog'

// Qual formulário está aberto, e com quais dados
type FormState =
  | { type: 'closed' }
  | { type: 'category'; category: Category | null }
  | { type: 'subcategory'; parent: Category; subcategory: Category | null }

export function CategoriesSettings() {
  const { data: categories = [], isPending, isError } = useCategories()
  const deleteCategory = useDeleteCategory()
  const reorder = useReorderCategories()

  const [kind, setKind] = useRemembered<CategoryKind>(
    'categorias:lista',
    'expense',
    umDe(categoryKinds),
  )
  const [form, setForm] = useState<FormState>({ type: 'closed' })
  const [deleting, setDeleting] = useState<Category | null>(null)
  /** A principal que vai virar subcategoria de outra (ex.: criada solta por engano) */
  const [movendo, setMovendo] = useState<Category | null>(null)

  const parents = categories.filter((item) => item.parentId === null)
  const childrenOf = (parentId: string) => categories.filter((item) => item.parentId === parentId)
  const visibleParents = parents.filter((item) => item.kind === kind)
  const findParent = (child: Category) => parents.find((item) => item.id === child.parentId)

  const closeForm = (open: boolean) => {
    if (!open) setForm({ type: 'closed' })
  }

  const deletingChildren = deleting ? childrenOf(deleting.id).length : 0

  /*
   * Arrastar: a lista de principais e, dentro de cada uma, a lista de subcategorias. Uma
   * subcategoria pode ser solta em outra principal — aí ela muda de mãe, e o tipo vem junto.
   */
  const zonas: DragZone[] = [
    { parentId: null, ids: visibleParents.map((item) => item.id) },
    ...visibleParents.map((parent) => ({
      parentId: parent.id,
      ids: childrenOf(parent.id).map((child) => child.id),
    })),
  ]

  const drag = useCategoryDrag({
    zonas,
    onDrop: ({ id, de, para, index }) => {
      const lista = (para === null ? visibleParents : childrenOf(para)).map((item) => item.id)
      const estava = lista.indexOf(id)
      const destino = estava !== -1 && index > estava ? index - 1 : index
      const ids = lista.filter((item) => item !== id)
      ids.splice(destino, 0, id)
      if (ids.every((item, i) => item === lista[i])) return
      reorder.mutate({ ids, parentId: de !== para && para ? para : undefined })
    },
  })

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
        {categoryKindsInOrder.map((item) => (
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
              <li
                key={parent.id}
                ref={drag.registrarItem(parent.id)}
                className={`relative bg-card py-1 transition-opacity ${
                  drag.arrastando?.id === parent.id ? 'opacity-40' : ''
                }`}
              >
                <div className="group/row relative flex items-center gap-2 py-1.5 pr-2 pl-2">
                  <Alca {...drag.alcaProps(parent.id, 'principal', null, parent.name)} />
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
                      // Só faz sentido para uma principal vazia: o app tem um nível só
                      ...(children.length === 0 && visibleParents.length > 1
                        ? [
                            {
                              label: 'Mover para dentro de…',
                              icon: CornerDownRight,
                              onSelect: () => setMovendo(parent),
                            },
                          ]
                        : []),
                    ]}
                    onDelete={() => setDeleting(parent)}
                  />
                </div>

                <Subcategorias
                  parent={parent}
                  itens={children}
                  drag={drag}
                  onEdit={(child) => setForm({ type: 'subcategory', parent, subcategory: child })}
                  onDelete={setDeleting}
                />
              </li>
            )
          })}
        </ul>
      )}

      <MoverParaDentroDialog
        categoria={movendo}
        destinos={visibleParents.filter((item) => item.id !== movendo?.id)}
        irmasDe={childrenOf}
        onOpenChange={(open) => {
          if (!open) setMovendo(null)
        }}
      />

      <CloneArrastado drag={drag} categories={categories} />
      <LinhaDeDestino drag={drag} />

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

/** A alça de arrastar: some do caminho (discreta) e vira mãozinha ao passar o mouse */
function Alca(props: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...props}
      className="cursor-grab touch-none rounded p-1 text-muted-foreground/50 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
    >
      <GripVertical className="size-4" />
    </button>
  )
}

type SubcategoriasProps = {
  parent: Category
  itens: Category[]
  drag: ReturnType<typeof useCategoryDrag>
  onEdit: (child: Category) => void
  onDelete: (child: Category) => void
}

/**
 * Subcategorias: sem ícone, presas por uma linha fina à principal. Arrastando, mudam de ordem
 * aqui dentro — ou de mãe, se soltas sobre outra principal. Enquanto alguém arrasta uma, até
 * as principais sem filhas mostram um espaço, para poderem receber.
 */
function Subcategorias({ parent, itens, drag, onEdit, onDelete }: SubcategoriasProps) {
  const arrastandoSub = drag.arrastando?.nivel === 'sub'
  // Sem filhas e ninguém arrastando: não há lista para mostrar
  if (itens.length === 0 && !arrastandoSub) return null

  return (
    <ul className="mb-1.5 ml-[2.625rem] border-l">
      {itens.length === 0 && (
        <li className="px-3 py-1.5 text-muted-foreground/70 text-xs">
          Solte aqui para trazer para “{parent.name}”
        </li>
      )}
      {itens.map((child) => (
        <li
          key={child.id}
          ref={drag.registrarItem(child.id)}
          className={`group/row relative flex min-h-9 items-center gap-1 bg-card py-0.5 pr-2 pl-3 transition-opacity ${
            drag.arrastando?.id === child.id ? 'opacity-40' : ''
          }`}
        >
          <Alca
            {...drag.alcaProps(child.id, 'sub', parent.id, `${child.name}, de ${parent.name}`)}
          />
          <span className="min-w-0 truncate text-sm">{child.name}</span>
          <RowActions
            itemName={child.name}
            onEdit={() => onEdit(child)}
            onDelete={() => onDelete(child)}
          />
        </li>
      ))}
    </ul>
  )
}

/**
 * A linha que mostra onde o item vai cair. Fica solta na tela, **acima** da cópia que segue o
 * dedo: escondida atrás dela, não serviria para nada.
 */
function LinhaDeDestino({ drag }: { drag: ReturnType<typeof useCategoryDrag> }) {
  const arrastando = drag.arrastando
  if (!arrastando) return null
  const linha = arrastando.alvo?.linha
  return createPortal(
    <span
      aria-hidden
      data-slot="linha-destino"
      ref={drag.linhaRef}
      style={{
        position: 'fixed',
        left: linha?.left ?? 0,
        top: (linha?.top ?? 0) - 1,
        width: linha?.width ?? 0,
        display: linha ? undefined : 'none',
      }}
      className="pointer-events-none z-[60] flex h-0.5 items-center rounded-full bg-primary"
    >
      <span className="-ml-1 size-2 rounded-full bg-primary" />
    </span>,
    document.body,
  )
}

/**
 * A cópia que segue o dedo enquanto se arrasta. Fica solta na tela (position fixed), fora da
 * lista: é o que permite levar uma subcategoria de um grupo para outro sem ela ser cortada
 * pelas bordas nem sumir no caminho.
 */
function CloneArrastado({
  drag,
  categories,
}: {
  drag: ReturnType<typeof useCategoryDrag>
  categories: Category[]
}) {
  const arrastando = drag.arrastando
  if (!arrastando) return null
  const category = categories.find((item) => item.id === arrastando.id)
  if (!category) return null

  return createPortal(
    <div
      aria-hidden
      data-slot="clone-arrastado"
      ref={drag.cloneRef}
      style={{
        position: 'fixed',
        /*
         * Nasce em cima do item de origem; daí em diante quem a move é o próprio arrasto,
         * por transform — sem passar pelo React. Só o eixo vertical: o que decide o destino
         * é a altura, e assim a cópia não escapa pela lateral da tela.
         */
        left: arrastando.rect.left,
        top: arrastando.rect.top,
        width: arrastando.rect.width,
        willChange: 'transform',
      }}
      className="pointer-events-none z-50 flex items-center gap-2 rounded-lg border bg-card py-1.5 pr-2 pl-2 opacity-90 shadow-xl"
    >
      <GripVertical className="size-4 text-muted-foreground/50" />
      {arrastando.nivel === 'principal' && <CategoryBadge {...categoryStyle(category)} />}
      <span
        className={`min-w-0 truncate text-sm ${arrastando.nivel === 'principal' ? 'font-medium' : ''}`}
      >
        {category.name}
      </span>
    </div>,
    document.body,
  )
}
