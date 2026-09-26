import { type CategoryKind, categoryKindLabels } from '@bolso/shared'
import { Check, ChevronDown, Plus, Tag } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { nextFreeColor } from '@/features/categories/colors'
import { CategoryBadge } from '@/features/categories/components/category-badge'
import { useCategories, useSaveCategory, useSaveSubcategory } from '@/features/categories/queries'
import { errorMessage } from '@/lib/errors'
import { type CategoryBranch, filterTree, searchKey } from '../category-options'

const NONE = 'sem-categoria'

type CategoryPickerProps = {
  tree: CategoryBranch[]
  /** Tipo do lançamento: a categoria criada aqui nasce já do lado certo */
  kind: CategoryKind
  value: string | null
  onChange: (categoryId: string | null) => void
  /** Categorias já usadas em outras partes do mesmo lançamento: não aparecem para escolher */
  exclude?: Set<string>
  id?: string
  label?: string
  invalid?: boolean
  /** O que aparece quando nada está escolhido ("Sem categoria", no lançamento) */
  vazio?: string
}

/**
 * Escolhe a categoria do lançamento, com busca. Digitar filtra principais e subcategorias,
 * sem depender de acento. Quando o texto casa com uma subcategoria, a principal dela continua
 * na lista, para a pessoa ver de onde aquela subcategoria vem (e poder escolher a principal).
 */
function CategoryPickerBase({
  tree,
  kind,
  value,
  onChange,
  exclude,
  id,
  label = 'Categoria',
  invalid,
  vazio = 'Sem categoria',
}: CategoryPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { data: categories = [] } = useCategories()
  const saveCategory = useSaveCategory()
  const saveSubcategory = useSaveSubcategory()

  const selected = useMemo(() => {
    for (const branch of tree) {
      if (branch.id === value) return { label: branch.name, branch }
      const child = branch.children.find((item) => item.id === value)
      if (child) return { label: `${branch.name} › ${child.name}`, branch }
    }
    return null
  }, [tree, value])

  const results = useMemo(() => filterTree(tree, query), [tree, query])

  const choose = (categoryId: string | null) => {
    onChange(categoryId)
    setOpen(false)
    setQuery('')
  }

  const nome = query.trim()
  const existe = tree.some(
    (branch) =>
      searchKey(branch.name) === searchKey(nome) ||
      branch.children.some((child) => searchKey(child.name) === searchKey(nome)),
  )
  /*
   * Onde a categoria nova vai nascer.
   *
   * O normal é dentro de um grupo: a principal é a pasta ("Casa"), e o gasto mora na filha
   * ("Luz", "Água"). Por isso os grupos vêm primeiro na lista e criar uma principal nova fica
   * por último — antes era o contrário, e quem criava no meio do lançamento acabava com uma
   * porção de categorias soltas na raiz.
   *
   * O grupo da categoria já escolhida no campo vai na frente: é o palpite mais provável.
   */
  const destinos = useMemo(() => {
    if (!selected) return tree
    const escolhido = selected.branch
    return [escolhido, ...tree.filter((branch) => branch.id !== escolhido.id)]
  }, [tree, selected])

  /*
   * Cria e já escolhe, como no seletor de contato. Ícone e cor entram num padrão (a cor é a
   * primeira livre da paleta, para a lista não ficar monocromática); o capricho fica em
   * Ajustes → Categorias.
   */
  const criar = async () => {
    try {
      const category = await saveCategory.mutateAsync({
        values: {
          name: nome,
          kind,
          icon: 'tag',
          color: nextFreeColor(categories.map((item) => item.color)),
        },
      })
      choose(category.id)
      toast.success(`${categoryKindLabels[kind].replace(/s$/, '')} "${category.name}" criada`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível criar a categoria.'))
    }
  }

  const criarDentro = async (parent: CategoryBranch) => {
    try {
      const category = await saveSubcategory.mutateAsync({
        parentId: parent.id,
        values: { name: nome },
      })
      choose(category.id)
      toast.success(`"${category.name}" criada dentro de ${parent.name}`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível criar a subcategoria.'))
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger
        id={id}
        // O rótulo leva junto o que está escolhido: o aria-label substitui o texto visível,
        // então sem isso um leitor de tela nunca diria qual categoria está selecionada
        aria-label={`${label}: ${selected?.label ?? vazio}`}
        aria-invalid={invalid}
        render={
          <Button
            variant="outline"
            className="w-full min-w-0 justify-between gap-2 font-normal aria-invalid:border-destructive"
          />
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected ? (
            <CategoryBadge icon={selected.branch.icon} color={selected.branch.color} size="xs" />
          ) : (
            <Tag className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className={`truncate ${selected ? '' : 'text-muted-foreground'}`}>
            {selected?.label ?? vazio}
          </span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-(--anchor-width) min-w-64 p-0">
        {/* A filtragem é nossa (filterTree), para a principal continuar visível */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar categoria…"
            value={query}
            onValueChange={setQuery}
            autoFocus
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>

            {!query && (
              <CommandItem value={NONE} onSelect={() => choose(null)}>
                <Tag className="text-muted-foreground" />
                Sem categoria
                {value === null && <Check className="ml-auto size-4" />}
              </CommandItem>
            )}

            {results.map((branch) => {
              const branchHidden = exclude?.has(branch.id)
              const children = branch.children.filter((child) => !exclude?.has(child.id))
              if (branchHidden && children.length === 0) return null
              return (
                <div key={branch.id}>
                  {branchHidden ? (
                    // Já usada em outra parte: fica só como título, para situar as filhas
                    <p className="px-2 py-1.5 text-muted-foreground text-xs">{branch.name}</p>
                  ) : (
                    <CommandItem value={branch.id} onSelect={() => choose(branch.id)}>
                      <CategoryBadge icon={branch.icon} color={branch.color} size="xs" />
                      {branch.name}
                      {value === branch.id && <Check className="ml-auto size-4" />}
                    </CommandItem>
                  )}
                  {children.map((child) => (
                    <CommandItem
                      key={child.id}
                      value={child.id}
                      onSelect={() => choose(child.id)}
                      className="pl-8"
                    >
                      {child.name}
                      {value === child.id && <Check className="ml-auto size-4" />}
                    </CommandItem>
                  ))}
                </div>
              )
            })}

            {nome && !existe && (
              <div className="mt-1 border-t pt-1">
                <p className="px-2 py-1.5 text-muted-foreground text-xs">
                  Criar “{nome}” dentro de
                </p>
                {destinos.map((branch) => (
                  <CommandItem
                    key={`criar-em-${branch.id}`}
                    value={`criar-em-${branch.id}`}
                    onSelect={() => void criarDentro(branch)}
                  >
                    <CategoryBadge icon={branch.icon} color={branch.color} size="xs" />
                    {branch.name}
                  </CommandItem>
                ))}
                <CommandItem
                  value="criar-principal"
                  onSelect={() => void criar()}
                  className="text-muted-foreground"
                >
                  <Plus />
                  Criar como categoria principal
                </CommandItem>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Memorizado: dentro de um formulário que muda a cada tecla, ele não precisa re-renderizar
export const CategoryPicker = memo(CategoryPickerBase)
