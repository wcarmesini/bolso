import type { DeleteScope, Transaction } from '@bolso/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { useDeleteTransaction } from '../queries'

type DeleteTransactionDialogProps = {
  transaction: Transaction | null
  onOpenChange: (open: boolean) => void
}

/**
 * Excluir um lançamento. Numa compra parcelada pergunta o alcance: só esta parcela,
 * esta e as próximas (compra cancelada ou quitada antes) ou a série inteira.
 */
export function DeleteTransactionDialog({
  transaction,
  onOpenChange,
}: DeleteTransactionDialogProps) {
  const deleteTransaction = useDeleteTransaction()
  const [busy, setBusy] = useState<DeleteScope | null>(null)
  const series = transaction?.installment ?? null

  const confirm = async (scope: DeleteScope) => {
    if (!transaction) return
    setBusy(scope)
    try {
      await deleteTransaction.mutateAsync({ id: transaction.id, scope })
      onOpenChange(false)
      toast.success(scope === 'one' ? 'Lançamento excluído' : 'Parcelas excluídas')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível excluir.'))
    } finally {
      setBusy(null)
    }
  }

  const options: { scope: DeleteScope; label: string }[] = series
    ? [
        { scope: 'one', label: `Só a parcela ${series.number}` },
        ...(series.number < series.count
          ? [{ scope: 'following' as const, label: 'Esta e as próximas' }]
          : []),
        { scope: 'all', label: `Todas as ${series.count} parcelas` },
      ]
    : [{ scope: 'one', label: 'Excluir' }]

  return (
    <AlertDialog open={transaction !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{series ? 'Excluir parcela?' : 'Excluir lançamento?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {series
              ? `Esta é a parcela ${series.number} de ${series.count}. Escolha o que sai para todo o grupo. Não dá para desfazer.`
              : 'Ele sai da lista para todo o grupo. Esta ação não pode ser desfeita.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className={series ? 'sm:flex-col sm:items-stretch' : undefined}>
          {options.map((option) => (
            <Button
              key={option.scope}
              variant="destructive"
              disabled={busy !== null}
              onClick={() => confirm(option.scope)}
            >
              {busy === option.scope ? 'Excluindo…' : option.label}
            </Button>
          ))}
          <AlertDialogCancel disabled={busy !== null}>Cancelar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
