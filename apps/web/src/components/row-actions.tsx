import { type LucideIcon, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePodeEditar } from '@/lib/access'

type ExtraAction = {
  label: string
  icon: LucideIcon
  onSelect: () => void
}

type RowActionsProps = {
  /** Nome do item, para leitores de tela e dicas: "Editar Mercado" */
  itemName: string
  onEdit?: () => void
  /** Ações próprias do item, entre "Editar" e "Excluir" (ex.: "Nova subcategoria") */
  actions?: ExtraAction[]
  onDelete: () => void
  deleteLabel?: string
}

/*
 * Ações de uma linha de lista, com visual clean (nada fica aparecendo em toda linha):
 * - Mouse (pointer-fine): ícones Editar / extras / Excluir logo depois do nome,
 *   visíveis só com o mouse sobre a linha ou ao navegar pelo teclado.
 * - Toque (pointer-coarse): não existe "passar o mouse". Um botão invisível cobre a linha
 *   inteira (pseudo-elemento ::after) e tocar nela abre um menu com as mesmas ações.
 * Requisitos: a linha tem `group/row relative`, e este componente vem logo após o nome.
 */
export function RowActions({
  itemName,
  onEdit,
  actions = [],
  onDelete,
  deleteLabel = 'Excluir',
}: RowActionsProps) {
  const podeEditar = usePodeEditar()
  // Quem só vê não tem o que fazer numa linha: nem editar, nem excluir
  if (!podeEditar) return null

  const allActions: ExtraAction[] = [
    ...(onEdit ? [{ label: 'Editar', icon: Pencil, onSelect: onEdit }] : []),
    ...actions,
  ]

  return (
    <>
      <div className="hidden shrink-0 items-center gap-0.5 pl-1 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 pointer-fine:flex">
        {allActions.map(({ label, icon: Icon, onSelect }) => (
          <Button
            key={label}
            variant="ghost"
            size="icon-xs"
            title={label}
            aria-label={`${label}: ${itemName}`}
            onClick={onSelect}
            className="text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <Icon className="size-3.5" />
          </Button>
        ))}
        <Button
          variant="ghost"
          size="icon-xs"
          title={deleteLabel}
          aria-label={`${deleteLabel}: ${itemName}`}
          onClick={onDelete}
          className="text-muted-foreground hover:bg-transparent hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Ações de ${itemName}`}
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="hidden opacity-0 after:absolute after:inset-0 pointer-coarse:inline-flex"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          {allActions.map(({ label, icon: Icon, onSelect }) => (
            <DropdownMenuItem key={label} onClick={onSelect}>
              <Icon />
              {label}
            </DropdownMenuItem>
          ))}
          {allActions.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            {deleteLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
