import { reconciliationLabel, type Transaction } from '@bolso/shared'
import { Link2Off, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { shortDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useUnreconcile } from '../queries'

/**
 * O selo de conciliação, dentro do formulário.
 *
 * Enquanto ele está aí, o valor, a conta e o tipo não se editam, e o lançamento não se
 * exclui: eles são o que identifica o movimento que o banco confirmou. Desfazer é possível —
 * e é um passo à parte, para ninguém apagar uma conferência sem perceber que apagou.
 */
export function ProvaDaConciliacao({
  transaction,
  onDesfeita,
}: {
  transaction: Transaction
  onDesfeita: () => void
}) {
  const desfazer = useUnreconcile()
  const [confirmando, setConfirmando] = useState(false)

  const soltar = async () => {
    try {
      await desfazer.mutateAsync(transaction.id)
      toast.success('Conciliação desfeita — a linha voltou para a caixa de entrada')
      onDesfeita()
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível desfazer a conciliação.'))
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/[0.06] p-3">
      <p className="flex items-start gap-2 text-sm">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span>
          <span className="font-medium">
            Conciliado com o {reconciliationLabel(transaction.sources)}
          </span>
          <span className="block text-muted-foreground text-xs">
            {transaction.sources.length > 1
              ? 'O mesmo movimento chegou pelos dois caminhos e os dois confirmam.'
              : 'O banco confirma este lançamento.'}{' '}
            Valor, conta e tipo ficam travados enquanto a conciliação valer.
          </span>
        </span>
      </p>

      <ul className="flex flex-col gap-0.5 pl-6 text-muted-foreground text-xs">
        {transaction.sources.map((prova) => (
          <li key={prova.id} className="truncate">
            {prova.label || 'movimento do banco'} · conferido em{' '}
            {shortDate(prova.createdAt.slice(0, 10))}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 pl-6">
        {confirmando ? (
          <>
            <span className="text-muted-foreground text-xs">
              A linha volta para a caixa de entrada. Confirma?
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmando(false)}
              disabled={desfazer.isPending}
            >
              Não
            </Button>
            <Button size="sm" onClick={soltar} disabled={desfazer.isPending}>
              {desfazer.isPending ? 'Desfazendo…' : 'Desfazer'}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setConfirmando(true)}
          >
            <Link2Off />
            Desfazer a conciliação
          </Button>
        )}
      </div>
    </div>
  )
}
