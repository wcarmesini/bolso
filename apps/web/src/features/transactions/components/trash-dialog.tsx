import { Trash2, Undo2 } from 'lucide-react'
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
import { useAccounts } from '@/features/accounts/queries'
import { shortDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { amountTone, formatSignedCents } from '../amount'
import { useDeletedTransactions, useRestoreTransaction } from '../queries'

const quando = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

type TrashDialogProps = { open: boolean; onOpenChange: (open: boolean) => void }

/**
 * A lixeira.
 *
 * Excluir no Bolso não apaga: marca. O lançamento some das telas e dos relatórios na hora,
 * mas continua no banco — e aqui dá para ver quem excluiu e trazer de volta exatamente como
 * estava, com as categorias e tudo.
 */
export function TrashDialog({ open, onOpenChange }: TrashDialogProps) {
  const { data: excluidos = [], isPending } = useDeletedTransactions(open)
  const { data: accounts = [] } = useAccounts()
  const restaurar = useRestoreTransaction()

  const voltar = async (id: string, descricao: string) => {
    try {
      await restaurar.mutateAsync(id)
      toast.success(`“${descricao || 'Lançamento'}” de volta`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível restaurar.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lixeira</DialogTitle>
          <DialogDescription>
            O que foi excluído continua aqui. Restaurar devolve o lançamento como ele estava.
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : excluidos.length === 0 ? (
          <EmptyState
            icon={Trash2}
            title="Lixeira vazia"
            text="Nada foi excluído por aqui — ou foi antes de a lixeira existir."
          />
        ) : (
          <ul className="-mx-2 min-h-0 flex-1 divide-y overflow-y-auto">
            {excluidos.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-2 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {item.description || 'Sem descrição'}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {[
                      shortDate(item.purchaseDate),
                      accounts.find((conta) => conta.id === item.accountId)?.name,
                      `excluído por ${item.deletedByName.split(' ')[0]} em ${quando(item.deletedAt)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className={`shrink-0 text-sm tabular-nums ${amountTone[item.type]}`}>
                  {formatSignedCents(item.type, item.amountCents)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  disabled={restaurar.isPending}
                  onClick={() => void voltar(item.id, item.description)}
                >
                  <Undo2 />
                  Restaurar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}
