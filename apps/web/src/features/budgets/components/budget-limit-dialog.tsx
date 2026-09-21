import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MoneyInput } from '@/components/money-input'
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
import { Field, FieldLabel } from '@/components/ui/field'
import { monthLabel } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useSetBudget } from '../queries'

export type LimitTarget = { categoryId: string; name: string; limitCents: number | null }

type BudgetLimitDialogProps = {
  target: LimitTarget | null
  month: string
  onOpenChange: (open: boolean) => void
}

/** Define ou tira o limite de uma categoria, valendo do mês visto em diante */
export function BudgetLimitDialog({ target, month, onOpenChange }: BudgetLimitDialogProps) {
  const setBudget = useSetBudget()
  const [cents, setCents] = useState(0)

  useEffect(() => {
    if (target) setCents(target.limitCents ?? 0)
  }, [target])

  const save = async (limitCents: number | null) => {
    if (!target) return
    try {
      await setBudget.mutateAsync({ categoryId: target.categoryId, month, limitCents })
      onOpenChange(false)
      toast.success(limitCents === null ? 'Limite removido' : 'Limite salvo')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível salvar o limite.'))
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            void save(cents)
          }}
        >
          <DialogHeader>
            <DialogTitle>Limite de {target?.name}</DialogTitle>
            <DialogDescription>
              Vale de {monthLabel(month)} em diante, até você mudar. Os meses anteriores não mudam.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="budget-limit">Quanto pode gastar por mês</FieldLabel>
            <MoneyInput
              id="budget-limit"
              autoFocus
              value={cents}
              onValueChange={setCents}
              className="text-lg"
            />
          </Field>

          <DialogFooter className="sm:justify-between">
            {target?.limitCents !== null ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={setBudget.isPending}
                onClick={() => save(null)}
              >
                Tirar limite
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button type="submit" disabled={setBudget.isPending}>
                {setBudget.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
