import {
  type Account,
  accountTypePlurals,
  accountTypes,
  cardCycleOf,
  hasInitialBalance,
} from '@bolso/shared'
import { Landmark, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { RowActions } from '@/components/row-actions'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { usePodeEditar } from '@/lib/access'
import { formatCents } from '@/lib/money'
import { accountTypeMeta } from '../meta'
import { useAccounts, useDeleteAccount } from '../queries'
import { AccountFormDialog } from './account-form-dialog'

export function AccountsSettings() {
  const podeEditar = usePodeEditar()
  const { data: accounts = [], isPending, isError } = useAccounts()
  const deleteAccount = useDeleteAccount()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [deleting, setDeleting] = useState<Account | null>(null)

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  /*
   * Uma lista por tipo, na ordem do balanço: o que se tem primeiro, dívida depois. Tudo
   * junto numa lista só, cartão e conta corrente se misturavam e ficava difícil achar.
   */
  const grupos = useMemo(
    () =>
      accountTypes
        .map((type) => ({ type, contas: accounts.filter((conta) => conta.type === type) }))
        .filter((grupo) => grupo.contas.length > 0),
    [accounts],
  )

  return (
    <>
      <SectionHeader
        title="Contas"
        description="Bancos, cartões e carteira de onde o dinheiro entra e sai."
        action={
          podeEditar && (
            <Button onClick={openNew}>
              <Plus />
              Nova conta
            </Button>
          )
        }
      />

      {isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar as contas.</p>
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="Nenhuma conta ainda"
          text="Cadastre seus bancos, cartões e a carteira para registrar de onde sai cada gasto."
        />
      ) : (
        grupos.map(({ type, contas }) => (
          <section key={type} className="flex flex-col gap-1.5">
            <h3 className="px-1 text-muted-foreground text-xs">
              {accountTypePlurals[type]} <span className="tabular-nums">({contas.length})</span>
            </h3>
            <ul className="divide-y rounded-xl border bg-card">
              {contas.map((account) => {
                const { icon: Icon } = accountTypeMeta[account.type]
                const cycle = cardCycleOf(account)
                // O título do grupo já diz o tipo; embaixo do nome só o que ele não diz
                const subtitle = cycle
                  ? `fecha dia ${cycle.closingDay}, vence dia ${cycle.dueDay}`
                  : ''
                const amount = hasInitialBalance(account.type)
                  ? account.initialBalanceCents
                  : account.limitCents
                return (
                  <li
                    key={account.id}
                    className="group/row relative flex items-center gap-3 py-2.5 pr-4 pl-4"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{account.name}</span>
                      {subtitle && (
                        <span className="block text-muted-foreground text-xs">{subtitle}</span>
                      )}
                    </span>
                    <RowActions
                      itemName={account.name}
                      onEdit={() => {
                        setEditing(account)
                        setFormOpen(true)
                      }}
                      onDelete={() => setDeleting(account)}
                    />
                    {amount !== null && (
                      <span className="ml-auto shrink-0 pl-2 text-right text-muted-foreground text-sm tabular-nums">
                        {!hasInitialBalance(account.type) && (
                          <span className="block text-xs">limite</span>
                        )}
                        {formatCents(amount)}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}

      <AccountFormDialog open={formOpen} onOpenChange={setFormOpen} account={editing} />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Excluir “${deleting?.name ?? ''}”?`}
        description="A conta sai da lista. Esta ação não pode ser desfeita."
        successMessage="Conta excluída"
        onConfirm={async () => {
          if (deleting) await deleteAccount.mutateAsync(deleting.id)
        }}
      />
    </>
  )
}
