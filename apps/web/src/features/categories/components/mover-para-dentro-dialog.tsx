import { type Category, categoryStyle } from '@bolso/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { errorMessage } from '@/lib/errors'
import { useReorderCategories } from '../queries'
import { CategoryBadge } from './category-badge'

type MoverParaDentroDialogProps = {
  /** A principal que vai virar subcategoria; nulo fecha o diálogo */
  categoria: Category | null
  destinos: Category[]
  /** As subcategorias que cada destino já tem, para a nova entrar no fim da lista */
  irmasDe: (parentId: string) => Category[]
  onOpenChange: (open: boolean) => void
}

/**
 * Transforma uma categoria principal em subcategoria de outra.
 *
 * É o conserto de quem criou a categoria no meio de um lançamento e ela nasceu solta na raiz.
 * Os lançamentos que já usam essa categoria continuam nela — muda só o lugar dela na árvore,
 * e com isso os relatórios passam a somá-la dentro do grupo novo.
 */
export function MoverParaDentroDialog({
  categoria,
  destinos,
  irmasDe,
  onOpenChange,
}: MoverParaDentroDialogProps) {
  const reorder = useReorderCategories()
  const [salvando, setSalvando] = useState<string | null>(null)

  const mover = async (destino: Category) => {
    if (!categoria) return
    setSalvando(destino.id)
    try {
      // A mesma chamada do arrastar: a lista nova do destino, com a nossa no fim
      await reorder.mutateAsync({
        parentId: destino.id,
        ids: [...irmasDe(destino.id).map((item) => item.id), categoria.id],
      })
      onOpenChange(false)
      toast.success(`“${categoria.name}” agora está dentro de ${destino.name}`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível mover a categoria.'))
    } finally {
      setSalvando(null)
    }
  }

  return (
    <Dialog open={categoria !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <div className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Mover “{categoria?.name}” para dentro de</DialogTitle>
            <DialogDescription>
              Ela deixa de ser um grupo e vira uma subcategoria. Os lançamentos que já usam
              continuam nela.
            </DialogDescription>
          </DialogHeader>

          <ul className="-mx-1 flex max-h-80 flex-col overflow-y-auto">
            {destinos.map((destino) => (
              <li key={destino.id}>
                <button
                  type="button"
                  onClick={() => void mover(destino)}
                  disabled={salvando !== null}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                >
                  <CategoryBadge {...categoryStyle(destino)} size="xs" />
                  <span className="min-w-0 truncate">{destino.name}</span>
                  {salvando === destino.id && (
                    <span className="ml-auto shrink-0 text-muted-foreground text-xs">movendo…</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
