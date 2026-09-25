import type { BankItemInfo } from '@bolso/shared'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { DateField } from '@/components/date-field'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccounts } from '@/features/accounts/queries'
import { toISODate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatCents } from '@/lib/money'
import { useLinkBankAccounts } from '../queries'

/** Três meses para trás: o bastante para conferir o passado recente sem puxar anos de história */
function padraoDeInicio() {
  const data = new Date()
  data.setMonth(data.getMonth() - 3)
  data.setDate(1)
  return toISODate(data)
}

type Escolha = { accountId: string | null; startDate: string }

type LinkAccountsDialogProps = {
  item: BankItemInfo | null
  /** A chave do Pluggy que abriu esta conexão: é com ela que ela será buscada depois */
  integrationKeyId?: string
  onOpenChange: (open: boolean) => void
}

/**
 * Depois que o banco autoriza: dizer qual conta de lá é qual conta daqui, e desde quando.
 *
 * A data de início é o que impede a caixa de entrada de nascer com dois anos de extrato para
 * aprovar. Nada antes dela é buscado — nem agora, nem nas buscas seguintes.
 */
export function LinkAccountsDialog({
  item,
  integrationKeyId,
  onOpenChange,
}: LinkAccountsDialogProps) {
  const { data: accounts = [] } = useAccounts()
  const ligar = useLinkBankAccounts()
  const [escolhas, setEscolhas] = useState<Record<string, Escolha>>({})

  useEffect(() => {
    if (!item) return
    setEscolhas(
      Object.fromEntries(
        item.accounts.map((conta) => [conta.id, { accountId: null, startDate: padraoDeInicio() }]),
      ),
    )
  }, [item])

  const accountItems = accounts.map((conta) => ({ value: conta.id, label: conta.name }))
  const novas = item?.accounts.filter((conta) => !conta.linked) ?? []
  const prontas = novas.filter((conta) => escolhas[conta.id]?.accountId)

  const salvar = async () => {
    if (!item) return
    try {
      await ligar.mutateAsync({
        itemId: item.itemId,
        integrationKeyId,
        links: prontas.map((conta) => ({
          externalAccountId: conta.id,
          accountId: escolhas[conta.id]?.accountId as string,
          startDate: escolhas[conta.id]?.startDate as string,
        })),
      })
      onOpenChange(false)
      toast.success(
        prontas.length === 1 ? 'Banco conectado' : `${prontas.length} contas conectadas`,
      )
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível ligar as contas.'))
    }
  }

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <div className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Ligar as contas do {item?.connectorName ?? 'banco'}</DialogTitle>
            <DialogDescription>
              Escolha em qual conta do Bolso cada uma entra e desde quando buscar. Os lançamentos
              ficam esperando sua aprovação — nada entra sozinho no orçamento.
            </DialogDescription>
          </DialogHeader>

          {novas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Todas as contas desta conexão já estão ligadas.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {novas.map((conta) => {
                const escolha = escolhas[conta.id] ?? {
                  accountId: null,
                  startDate: padraoDeInicio(),
                }
                const mudar = (mudanca: Partial<Escolha>) =>
                  setEscolhas((atual) => ({
                    ...atual,
                    [conta.id]: { ...escolha, ...mudanca },
                  }))

                return (
                  <li key={conta.id} className="rounded-xl border bg-card p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm">
                        {conta.name}
                        {conta.number && (
                          <span className="text-muted-foreground"> · {conta.number}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                        {formatCents(conta.balanceCents)}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-end gap-2">
                      <div className="flex min-w-44 flex-1 flex-col gap-1.5">
                        <span className="text-muted-foreground text-xs">Conta do Bolso</span>
                        <Select
                          items={accountItems}
                          value={escolha.accountId ?? ''}
                          onValueChange={(next) => mudar({ accountId: next as string })}
                        >
                          <SelectTrigger aria-label="Conta do Bolso" className="w-full">
                            <SelectValue placeholder="Não trazer esta conta" />
                          </SelectTrigger>
                          <SelectContent>
                            {accountItems.map((opcao) => (
                              <SelectItem key={opcao.value} value={opcao.value}>
                                {opcao.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <span className="text-muted-foreground text-xs">Buscar a partir de</span>
                        <DateField
                          label="Buscar a partir de"
                          value={escolha.startDate}
                          onChange={(next) => mudar({ startDate: next ?? padraoDeInicio() })}
                        />
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={salvar} disabled={prontas.length === 0 || ligar.isPending}>
              {ligar.isPending ? 'Conectando…' : 'Conectar'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
