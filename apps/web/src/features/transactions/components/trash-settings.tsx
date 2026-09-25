import { Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
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

/**
 * A lixeira.
 *
 * Excluir no Bolso não apaga: marca. O lançamento some das telas e dos relatórios na hora,
 * mas continua no banco — e aqui dá para ver quem excluiu e trazer de volta exatamente como
 * estava, com as categorias e tudo.
 *
 * Mora nos ajustes, e não na tela de lançamentos, porque desfazer uma exclusão é coisa rara:
 * quem precisa dela vai procurá-la, e quem não precisa não tropeça nela todo dia.
 */
export function TrashSettings() {
  const { data: excluidos = [], isPending, isError } = useDeletedTransactions()
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
    <>
      <SectionHeader
        title="Lixeira"
        description="O que foi excluído continua aqui. Restaurar devolve o lançamento como ele estava."
      />

      {isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar a lixeira.</p>
      ) : isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : excluidos.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Lixeira vazia"
          text="Nada foi excluído por aqui — ou foi antes de a lixeira existir."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {excluidos.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <Trash2 className="size-4" />
              </span>
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
    </>
  )
}
