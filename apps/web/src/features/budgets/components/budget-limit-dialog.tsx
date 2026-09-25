import { type BudgetItem, MAX_BUDGET_ITEMS, sumItems } from '@bolso/shared'
import { Plus, X } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { monthLabel } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCents } from '@/lib/money'
import { useSetBudget } from '../queries'

export type LimitTarget = {
  categoryId: string
  name: string
  limitCents: number | null
  items: BudgetItem[]
  /** Entrada é previsão de receber; saída é limite de gasto */
  kind: 'expense' | 'income'
  /*
   * Principal e subcategorias têm que fechar. Numa subcategoria, "cabe" é o que sobra do
   * orçamento da principal; numa principal, "mínimo" é o que as subcategorias já somam.
   */
  cabe?: { ate: number; principal: string } | null
  minimo?: number | null
}

type BudgetLimitDialogProps = {
  target: LimitTarget | null
  month: string
  onOpenChange: (open: boolean) => void
}

const itemVazio = (): BudgetItem => ({ name: '', amountCents: 0 })

/**
 * Define o orçamento de uma categoria, valendo do mês visto em diante.
 *
 * Pode ser um valor só ou um **detalhamento**: "Salário Débora" mais "Salário Wilson". Com
 * detalhamento, o valor do orçamento é a soma dos itens — eles são a conta, não um comentário.
 */
export function BudgetLimitDialog({ target, month, onOpenChange }: BudgetLimitDialogProps) {
  const setBudget = useSetBudget()
  const [cents, setCents] = useState(0)
  const [items, setItems] = useState<BudgetItem[]>([])
  const [detalhado, setDetalhado] = useState(false)

  useEffect(() => {
    if (!target) return
    setCents(target.limitCents ?? 0)
    setItems(target.items.length > 0 ? target.items : [itemVazio(), itemVazio()])
    setDetalhado(target.items.length > 0)
  }, [target])

  const entrada = target?.kind === 'income'
  const preenchidos = items.filter((item) => item.name.trim() && item.amountCents > 0)
  const total = detalhado ? sumItems(preenchidos) : cents

  const acimaDoQueCabe = target?.cabe != null && total > target.cabe.ate
  const abaixoDasFilhas = target?.minimo != null && total < target.minimo
  const aviso = acimaDoQueCabe
    ? `Cabe no máximo ${formatCents(target.cabe?.ate ?? 0)} aqui: é o que sobra de ${target.cabe?.principal}.`
    : abaixoDasFilhas
      ? `As subcategorias já somam ${formatCents(target.minimo ?? 0)}; o orçamento não pode ser menor.`
      : target?.cabe != null
        ? `Cabe até ${formatCents(target.cabe.ate)} aqui, do orçamento de ${target.cabe.principal}.`
        : null

  const mudarItem = (index: number, mudanca: Partial<BudgetItem>) =>
    setItems((atual) => atual.map((item, i) => (i === index ? { ...item, ...mudanca } : item)))

  const salvar = async (limitCents: number | null) => {
    if (!target) return
    try {
      await setBudget.mutateAsync({
        categoryId: target.categoryId,
        month,
        limitCents,
        items: limitCents === null || !detalhado ? [] : preenchidos,
      })
      onOpenChange(false)
      toast.success(
        limitCents === null ? 'Orçamento removido' : entrada ? 'Previsão salva' : 'Limite salvo',
      )
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível salvar.'))
    }
  }

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void salvar(total)
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {entrada ? 'Previsão de' : 'Orçamento de'} {target?.name}
            </DialogTitle>
            <DialogDescription>
              Vale de {monthLabel(month)} em diante, até você mudar. Os meses anteriores não mudam.
            </DialogDescription>
          </DialogHeader>

          <ToggleGroup
            variant="outline"
            spacing={0}
            value={[detalhado ? 'itens' : 'valor']}
            onValueChange={(next) => {
              if (next[0] === 'itens') setDetalhado(true)
              if (next[0] === 'valor') setDetalhado(false)
            }}
            className="w-full"
          >
            <ToggleGroupItem value="valor" className="flex-1">
              Valor único
            </ToggleGroupItem>
            <ToggleGroupItem value="itens" className="flex-1">
              Detalhado
            </ToggleGroupItem>
          </ToggleGroup>

          {detalhado ? (
            <div className="flex flex-col gap-2">
              {items.map((item, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: as linhas não têm id próprio
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`Item ${index + 1}`}
                    placeholder={entrada ? 'Ex.: Salário Wilson' : 'Ex.: Feira'}
                    autoComplete="off"
                    value={item.name}
                    onChange={(event) => mudarItem(index, { name: event.target.value })}
                    className="min-w-0 flex-1"
                  />
                  <MoneyInput
                    aria-label={`Valor do item ${index + 1}`}
                    value={item.amountCents}
                    onValueChange={(amountCents) => mudarItem(index, { amountCents })}
                    className="w-32 shrink-0"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Tirar o item ${index + 1}`}
                    className="shrink-0 text-muted-foreground"
                    onClick={() => setItems((atual) => atual.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </div>
              ))}

              <div className="flex items-center justify-between gap-2 text-xs">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="-ml-2 text-muted-foreground"
                  disabled={items.length >= MAX_BUDGET_ITEMS}
                  onClick={() => setItems((atual) => [...atual, itemVazio()])}
                >
                  <Plus />
                  Adicionar item
                </Button>
                <span className="tabular-nums">
                  <span className="text-muted-foreground">Total </span>
                  <span className="font-medium">{formatCents(total)}</span>
                </span>
              </div>
            </div>
          ) : (
            <Field>
              <FieldLabel htmlFor="budget-limit">
                {entrada ? 'Quanto espera receber por mês' : 'Quanto pode gastar por mês'}
              </FieldLabel>
              <MoneyInput
                id="budget-limit"
                autoFocus
                value={cents}
                onValueChange={setCents}
                className="text-lg"
              />
            </Field>
          )}

          {aviso && (
            <p
              className={`text-xs ${acimaDoQueCabe || abaixoDasFilhas ? 'text-destructive' : 'text-muted-foreground'}`}
            >
              {aviso}
            </p>
          )}

          <DialogFooter className="sm:justify-between">
            {target?.limitCents !== null ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={setBudget.isPending}
                onClick={() => salvar(null)}
              >
                Tirar orçamento
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button
                type="submit"
                disabled={setBudget.isPending || total <= 0 || acimaDoQueCabe || abaixoDasFilhas}
              >
                {setBudget.isPending ? 'Salvando…' : 'Salvar'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
