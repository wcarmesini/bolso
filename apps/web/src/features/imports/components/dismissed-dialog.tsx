import { EyeOff, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useDismissed, useUndismiss } from '@/features/bank/queries'
import { shortDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCents } from '@/lib/money'

/**
 * O que foi dispensado.
 *
 * Dispensar resolve a linha, mas não a apaga — às vezes se dispensa por engano, às vezes vale
 * rever meses depois. Trazer de volta devolve a linha à fila exatamente como ela chegou do
 * banco, para ser aprovada ou conciliada.
 */
export function DismissedDialog({
  connectionId,
  open,
  onOpenChange,
}: {
  connectionId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: dispensados = [], isPending } = useDismissed(connectionId, open)
  const voltar = useUndismiss()

  const trazer = async (id: string, descricao: string) => {
    if (!connectionId) return
    try {
      await voltar.mutateAsync({ id: connectionId, ids: [id] })
      toast.success(`“${descricao}” voltou para a fila`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível trazer de volta.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dispensados</DialogTitle>
          <DialogDescription>
            Nada do que o banco mandou se perde. Trazer de volta devolve a linha para a fila.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : dispensados.length === 0 ? (
          <EmptyState
            icon={EyeOff}
            title="Nada dispensado"
            text="Quando você dispensar uma linha do banco, ela fica guardada aqui."
          />
        ) : (
          <ul className="-mx-2 min-h-0 flex-1 divide-y overflow-y-auto">
            {dispensados.map((item) => {
              const entrada = item.amountCents > 0
              return (
                <li key={item.id} className="flex items-center gap-3 px-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{item.description || '—'}</span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {[shortDate(item.date), item.kind].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      entrada ? 'text-emerald-600 dark:text-emerald-400' : ''
                    }`}
                  >
                    {entrada ? '+' : '−'}
                    {formatCents(Math.abs(item.amountCents))}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground"
                    disabled={voltar.isPending}
                    onClick={() => void trazer(item.id, item.description)}
                  >
                    <Undo2 />
                    Trazer de volta
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
