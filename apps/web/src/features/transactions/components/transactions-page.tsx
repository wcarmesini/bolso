import { cardCycleOf, statementFor, type Transaction } from '@bolso/shared'
import { ArrowLeftRight, CreditCard, Plus, Split, Tag } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { MonthNav } from '@/components/month-nav'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'
import { RowActions } from '@/components/row-actions'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccounts } from '@/features/accounts/queries'
import { useMe } from '@/features/auth/queries'
import { CategoryBadge } from '@/features/categories/components/category-badge'
import { useCategories } from '@/features/categories/queries'
import { currentMonth, dayLabel, shortMonthLabel, today } from '@/lib/dates'
import { amountTone, formatSignedCents } from '../amount'
import { type CategoryInfo, categoryInfoById } from '../category-options'
import { useTransactions } from '../queries'
import { DeleteTransactionDialog } from './delete-transaction-dialog'
import { MonthSummary } from './month-summary'
import { StatementSummary } from './statement-summary'
import { TransactionFormDialog } from './transaction-form-dialog'

const ALL = 'all'

/** A lista vem ordenada por data; aqui ela só é fatiada em dias */
function groupByDay(transactions: Transaction[]) {
  const days: { date: string; items: Transaction[] }[] = []
  for (const transaction of transactions) {
    const last = days.at(-1)
    if (last?.date === transaction.purchaseDate) last.items.push(transaction)
    else days.push({ date: transaction.purchaseDate, items: [transaction] })
  }
  return days
}

/** Como a linha fala das categorias: uma só pelo nome; divididas como "Mercado + 1" */
function describeSplits(transaction: Transaction, info: Map<string, CategoryInfo>) {
  const [first, ...rest] = transaction.splits
  const firstInfo = first?.categoryId ? info.get(first.categoryId) : undefined
  const firstLabel = firstInfo?.label ?? (first ? 'Sem categoria' : undefined)
  return {
    badge: rest.length === 0 ? firstInfo : undefined,
    split: rest.length > 0,
    label: firstLabel && rest.length > 0 ? `${firstLabel} + ${rest.length}` : firstLabel,
  }
}

export function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth)
  const [accountId, setAccountId] = useState<string | null>(null)
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: me } = useMe()

  const account = accounts.find((item) => item.id === accountId)
  const cycle = account ? cardCycleOf(account) : null
  // Cartão escolhido: a tela vira a fatura (as compras que vencem no mês)
  const view = cycle ? 'statement' : 'month'
  const home = cycle ? statementFor(today(), cycle).month : currentMonth()

  const {
    data: transactions = [],
    isPending,
    isError,
  } = useTransactions({ month, accountId, view })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)

  const categoryInfo = useMemo(() => categoryInfoById(categories), [categories])
  const accountName = useMemo(
    () => new Map(accounts.map((item) => [item.id, item.name])),
    [accounts],
  )
  const days = useMemo(() => groupByDay(transactions), [transactions])

  const chooseAccount = (next: string | null) => {
    setAccountId(next)
    // Ao trocar entre fatura e mês, volta para a referência de cada um
    const nextAccount = accounts.find((item) => item.id === next)
    const nextCycle = nextAccount ? cardCycleOf(nextAccount) : null
    setMonth(nextCycle ? statementFor(today(), nextCycle).month : currentMonth())
  }

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const accountItems = [
    { value: ALL, label: 'Todas as contas' },
    ...accounts.map((item) => ({ value: item.id, label: item.name })),
  ]

  return (
    <>
      <PageHeader title="Lançamentos" />
      <PageBody>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MonthNav
            month={month}
            onChange={setMonth}
            prefix={cycle ? 'Fatura de' : undefined}
            home={home}
          />
          <div className="flex items-center gap-2">
            {accounts.length > 0 && (
              <Select
                items={accountItems}
                value={accountId ?? ALL}
                onValueChange={(next) => chooseAccount(next === ALL ? null : (next as string))}
              >
                <SelectTrigger aria-label="Filtrar por conta" className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button onClick={openNew} className="hidden md:inline-flex">
              <Plus />
              Novo lançamento
            </Button>
          </div>
        </div>

        {isError ? (
          <p className="text-destructive text-sm">Não foi possível carregar os lançamentos.</p>
        ) : isPending ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : (
          <>
            {account && cycle ? (
              <StatementSummary account={account} month={month} transactions={transactions} />
            ) : (
              transactions.length > 0 && <MonthSummary transactions={transactions} />
            )}

            {transactions.length === 0 ? (
              <EmptyState
                icon={cycle ? CreditCard : ArrowLeftRight}
                title={cycle ? 'Fatura sem compras' : 'Nenhum lançamento neste mês'}
                text={
                  cycle
                    ? 'As compras neste cartão aparecem na fatura em que vencem, parcelas incluídas.'
                    : 'O que qualquer pessoa do grupo lançar aparece aqui na hora, sem recarregar.'
                }
              />
            ) : (
              <div className="flex flex-col gap-4">
                {days.map(({ date, items }) => (
                  <section key={date} className="flex flex-col gap-1.5">
                    <h2 className="px-1 text-muted-foreground text-xs first-letter:uppercase">
                      {dayLabel(date)}
                    </h2>
                    <ul className="divide-y rounded-xl border bg-card">
                      {items.map((transaction) => (
                        <TransactionRow
                          key={transaction.id}
                          transaction={transaction}
                          categoryInfo={categoryInfo}
                          accountName={accountId ? undefined : accountName}
                          showStatement={!cycle}
                          myId={me?.user.id}
                          onEdit={() => {
                            setEditing(transaction)
                            setFormOpen(true)
                          }}
                          onDelete={() => setDeleting(transaction)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </PageBody>

      {/* No celular o botão fica ao alcance do polegar, acima das abas */}
      <Button
        onClick={openNew}
        size="icon-lg"
        aria-label="Novo lançamento"
        className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] size-14 rounded-full shadow-lg md:hidden"
      >
        <Plus className="size-6" />
      </Button>

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        month={cycle ? currentMonth() : month}
        defaultAccountId={accountId}
      />

      <DeleteTransactionDialog
        transaction={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />
    </>
  )
}

type TransactionRowProps = {
  transaction: Transaction
  categoryInfo: Map<string, CategoryInfo>
  /** Ausente quando a lista já é de uma conta só (repetir o nome dela seria ruído) */
  accountName?: Map<string, string>
  /** Mostrar "fatura out/26" (desligado quando a lista já é a fatura) */
  showStatement: boolean
  myId?: string
  onEdit: () => void
  onDelete: () => void
}

function TransactionRow({
  transaction,
  categoryInfo,
  accountName,
  showStatement,
  myId,
  onEdit,
  onDelete,
}: TransactionRowProps) {
  const categories = describeSplits(transaction, categoryInfo)
  const title = transaction.description || categories.label || 'Lançamento'
  const series = transaction.installment
  const details = [
    // Quando a descrição é o próprio nome da categoria, repetir só polui
    categories.label && categories.label !== title ? categories.label : undefined,
    transaction.accountId ? accountName?.get(transaction.accountId) : undefined,
    transaction.createdBy === myId ? undefined : transaction.createdByName.split(' ')[0],
    transaction.statementMonth
      ? showStatement
        ? `fatura ${shortMonthLabel(transaction.statementMonth)}`
        : undefined
      : transaction.paymentDate
        ? undefined
        : 'a pagar',
  ].filter(Boolean)

  return (
    <li className="group/row relative flex items-center gap-3 py-2.5 pr-4 pl-4">
      {categories.badge ? (
        <CategoryBadge icon={categories.badge.icon} color={categories.badge.color} />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          {categories.split ? <Split className="size-4" /> : <Tag className="size-4" />}
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm">{title}</span>
          {series && (
            <span className="shrink-0 rounded bg-muted px-1 text-[11px] text-muted-foreground tabular-nums">
              {series.number}/{series.count}
            </span>
          )}
        </span>
        {details.length > 0 && (
          <span className="block truncate text-muted-foreground text-xs">
            {details.join(' · ')}
          </span>
        )}
      </span>
      <RowActions itemName={title} onEdit={onEdit} onDelete={onDelete} />
      <span
        className={`ml-auto shrink-0 pl-2 text-sm tabular-nums ${amountTone[transaction.type]}`}
      >
        {formatSignedCents(transaction.type, transaction.amountCents)}
      </span>
    </li>
  )
}
