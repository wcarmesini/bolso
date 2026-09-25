import { cardCycleOf, reconciliationLabel, statementFor, type Transaction } from '@bolso/shared'
import { Link } from '@tanstack/react-router'
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  ChevronDown,
  Copy,
  CreditCard,
  FileUp,
  Plus,
  Split,
  Tag,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { MonthNav } from '@/components/month-nav'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'
import { RowActions } from '@/components/row-actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { useContacts } from '@/features/contacts/queries'
import { TransferFormDialog } from '@/features/transfers/components/transfer-form-dialog'
import { useDeleteTransfer } from '@/features/transfers/queries'
import { useRemembered } from '@/hooks/use-remembered'
import { currentMonth, dayLabel, shortMonthLabel, today } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { amountTone, formatSignedCents } from '../amount'
import { type CategoryInfo, categoryInfoById } from '../category-options'
import { useTransactions } from '../queries'
import { DeleteTransactionDialog } from './delete-transaction-dialog'
import { MonthSummary } from './month-summary'
import { StatementSummary } from './statement-summary'
import { TransactionFormDialog } from './transaction-form-dialog'
import { TrashDialog } from './trash-dialog'

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
  /*
   * A conta escolhida fica lembrada; o mês, não: sem escolha, vale sempre a referência de
   * hoje — o mês atual, ou a fatura aberta quando a conta é um cartão.
   */
  const [escolhido, setMonth] = useState<string | null>(null)
  const [accountId, setAccountId] = useRemembered<string | null>(
    'lancamentos:conta',
    null,
    (value) => value === null || typeof value === 'string',
  )
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: me } = useMe()
  const { data: contacts = [] } = useContacts()

  const account = accounts.find((item) => item.id === accountId)
  const cycle = account ? cardCycleOf(account) : null
  // Cartão escolhido: a tela vira a fatura (as compras que vencem no mês)
  const view = cycle ? 'statement' : 'month'
  const home = cycle ? statementFor(today(), cycle).month : currentMonth()
  const month = escolhido ?? home

  // A conta lembrada pode ter sido apagada nesse meio tempo
  useEffect(() => {
    if (accountId && accounts.length > 0 && !account) setAccountId(null)
  }, [accountId, accounts.length, account, setAccountId])

  const {
    data: transactions = [],
    isPending,
    isError,
  } = useTransactions({ month, accountId, view })

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [cloning, setCloning] = useState<Transaction | null>(null)
  const [deleting, setDeleting] = useState<Transaction | null>(null)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferindo, setTransferindo] = useState<Transaction | null>(null)
  const [apagandoTransfer, setApagandoTransfer] = useState<Transaction | null>(null)
  const [lixeiraAberta, setLixeiraAberta] = useState(false)
  const deleteTransfer = useDeleteTransfer()

  const categoryInfo = useMemo(() => categoryInfoById(categories), [categories])
  const accountName = useMemo(
    () => new Map(accounts.map((item) => [item.id, item.name])),
    [accounts],
  )
  const contactName = useMemo(
    () => new Map(contacts.map((item) => [item.id, item.name])),
    [contacts],
  )
  /*
   * Sem filtro de conta, uma transferência apareceria duas vezes (saindo e entrando): fica
   * só a perna de saída, que já diz o caminho inteiro. Filtrando por conta, cada lado aparece
   * no extrato dela, como num banco.
   */
  const visiveis = useMemo(
    () =>
      accountId
        ? transactions
        : transactions.filter((item) => !item.transfer || item.type === 'expense'),
    [transactions, accountId],
  )
  const days = useMemo(() => groupByDay(visiveis), [visiveis])

  const chooseAccount = (next: string | null) => {
    setAccountId(next)
    // Ao trocar entre fatura e mês, volta para a referência de cada um
    setMonth(null)
  }

  const [novoTipo, setNovoTipo] = useState<'expense' | 'income'>('expense')

  const openNew = (tipo: 'expense' | 'income' = 'expense') => {
    setEditing(null)
    setCloning(null)
    setNovoTipo(tipo)
    setFormOpen(true)
  }

  const abrirTransferencia = () => {
    setTransferindo(null)
    setTransferOpen(true)
  }

  const openClone = (transaction: Transaction) => {
    setEditing(null)
    setCloning(transaction)
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
            <MenuDeLancar
              onNovo={openNew}
              onTransferir={abrirTransferencia}
              onLixeira={() => setLixeiraAberta(true)}
              gatilho={
                <Button className="hidden md:inline-flex">
                  <Plus />
                  Novo lançamento
                  <ChevronDown className="opacity-70" />
                </Button>
              }
            />
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
                          accountNames={accountName}
                          contactName={contactName}
                          showStatement={!cycle}
                          myId={me?.user.id}
                          onEdit={() => {
                            if (transaction.transfer) {
                              setTransferindo(transaction)
                              setTransferOpen(true)
                              return
                            }
                            setCloning(null)
                            setEditing(transaction)
                            setFormOpen(true)
                          }}
                          onClone={() => openClone(transaction)}
                          onDelete={() =>
                            transaction.transfer
                              ? setApagandoTransfer(transaction)
                              : setDeleting(transaction)
                          }
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

      {/* No celular o botão fica ao alcance do polegar, acima das abas, e abre o mesmo menu */}
      <MenuDeLancar
        onNovo={openNew}
        onTransferir={abrirTransferencia}
        onLixeira={() => setLixeiraAberta(true)}
        gatilho={
          <Button
            size="icon-lg"
            aria-label="Novo lançamento"
            className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] size-14 rounded-full shadow-lg md:hidden"
          >
            <Plus className="size-6" />
          </Button>
        }
      />

      <TransactionFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        transaction={editing}
        cloneOf={cloning}
        month={cycle ? currentMonth() : month}
        defaultAccountId={accountId}
        defaultType={novoTipo}
      />

      <DeleteTransactionDialog
        transaction={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      />

      <TrashDialog open={lixeiraAberta} onOpenChange={setLixeiraAberta} />

      <TransferFormDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        transfer={transferindo}
        defaultAccountId={accountId}
      />

      <ConfirmDeleteDialog
        open={apagandoTransfer !== null}
        onOpenChange={(open) => {
          if (!open) setApagandoTransfer(null)
        }}
        title="Excluir esta transferência?"
        description="Some das duas contas de uma vez — a que enviou e a que recebeu."
        successMessage="Transferência excluída"
        onConfirm={async () => {
          const groupId = apagandoTransfer?.transfer?.groupId
          if (groupId) await deleteTransfer.mutateAsync(groupId)
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
  /** Todas as contas, para a transferência sempre poder dizer de onde veio e para onde foi */
  accountNames: Map<string, string>
  contactName: Map<string, string>
  /** Mostrar "fatura out/26" (desligado quando a lista já é a fatura) */
  showStatement: boolean
  myId?: string
  onEdit: () => void
  onClone: () => void
  onDelete: () => void
}

function TransactionRow({
  transaction,
  categoryInfo,
  accountName,
  accountNames,
  contactName,
  showStatement,
  myId,
  onEdit,
  onClone,
  onDelete,
}: TransactionRowProps) {
  const categories = describeSplits(transaction, categoryInfo)
  const transferencia = transaction.transfer
  /*
   * Transferência não tem categoria: o que interessa é o caminho do dinheiro. A seta segue o
   * lado que se está vendo — saindo desta conta, ou chegando nela.
   */
  const caminho = transferencia
    ? transaction.type === 'expense'
      ? `${accountNames.get(transaction.accountId ?? '') ?? 'conta'} → ${accountNames.get(transferencia.counterpartAccountId ?? '') ?? 'conta'}`
      : `${accountNames.get(transferencia.counterpartAccountId ?? '') ?? 'conta'} → ${accountNames.get(transaction.accountId ?? '') ?? 'conta'}`
    : null
  const title =
    transaction.description || (transferencia ? 'Transferência' : categories.label) || 'Lançamento'
  const series = transaction.installment
  const details = transferencia
    ? [
        caminho,
        transaction.createdBy === myId ? undefined : transaction.createdByName.split(' ')[0],
      ].filter(Boolean)
    : [
        // Quando a descrição é o próprio nome da categoria, repetir só polui
        categories.label && categories.label !== title ? categories.label : undefined,
        transaction.contactId ? contactName.get(transaction.contactId) : undefined,
        transaction.accountId ? accountName?.get(transaction.accountId) : undefined,
        transaction.createdBy === myId ? undefined : transaction.createdByName.split(' ')[0],
        transaction.statementMonth
          ? showStatement
            ? `fatura ${shortMonthLabel(transaction.statementMonth)}`
            : undefined
          : transaction.paymentDate
            ? undefined
            : 'a pagar',
        /*
         * A conciliação é o selo de conferência do lançamento: ela diz que aquele número não
         * é só o que alguém digitou, é o que o banco confirmou. Por isso aparece com a
         * origem — e com as duas, quando o mesmo movimento chegou pelos dois caminhos.
         */
        transaction.sources.length > 0
          ? `conciliado · ${reconciliationLabel(transaction.sources)}`
          : undefined,
      ].filter(Boolean)

  return (
    <li className="group/row relative flex items-center gap-3 py-2.5 pr-4 pl-4">
      {transferencia ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <ArrowLeftRight className="size-4" />
        </span>
      ) : categories.badge ? (
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
      <RowActions
        itemName={title}
        onEdit={onEdit}
        actions={transferencia ? [] : [{ label: 'Duplicar', icon: Copy, onSelect: onClone }]}
        onDelete={onDelete}
      />
      <span
        className={`ml-auto shrink-0 pl-2 text-sm tabular-nums ${
          transferencia ? 'text-muted-foreground' : amountTone[transaction.type]
        }`}
      >
        {transferencia
          ? formatCents(transaction.amountCents)
          : formatSignedCents(transaction.type, transaction.amountCents)}
      </span>
    </li>
  )
}

type MenuDeLancarProps = {
  onNovo: (tipo: 'expense' | 'income') => void
  onTransferir: () => void
  onLixeira: () => void
  gatilho: React.ReactElement
  className?: string
}

/**
 * As formas de pôr dinheiro na tela, num lugar só: entrada, saída, transferência entre contas
 * e importar extrato. Antes eram três botões soltos na barra; juntos, sobra espaço e fica
 * claro que são variações da mesma coisa.
 */
function MenuDeLancar({ onNovo, onTransferir, onLixeira, gatilho, className }: MenuDeLancarProps) {
  return (
    <div className={className}>
      <DropdownMenu>
        <DropdownMenuTrigger render={gatilho} />
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => onNovo('expense')}>
            <ArrowUpRight />
            Saída
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onNovo('income')}>
            <ArrowDownLeft className="text-emerald-600 dark:text-emerald-400" />
            Entrada
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onTransferir}>
            <ArrowLeftRight />
            Transferência entre contas
          </DropdownMenuItem>
          <DropdownMenuItem nativeButton={false} render={<Link to="/importar" />}>
            <FileUp />
            Importar extrato
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onLixeira}>
            <Trash2 />
            Lixeira
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
