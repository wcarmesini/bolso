import {
  isCreditCard,
  type ReportBasis,
  reportBasisLabels,
  type Transaction,
  type TransactionType,
} from '@bolso/shared'
import { Receipt } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useAccounts } from '@/features/accounts/queries'
import { useCategories } from '@/features/categories/queries'
import { useContacts } from '@/features/contacts/queries'
import { amountTone, formatSignedCents } from '@/features/transactions/amount'
import { TransactionFormDialog } from '@/features/transactions/components/transaction-form-dialog'
import { useTransactionSlice } from '@/features/transactions/queries'
import { shortDate, shortMonthLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'

/** O número que a pessoa clicou: categoria (ou "sem categoria"), período e regime */
export type DetailTarget = {
  categoryId: string | null
  name: string
  /** "out/26", "3º tri/26"… já pronto para o título */
  periodLabel: string
  from: string
  to: string
  type: TransactionType
  basis: ReportBasis
}

type MonthlyDetailDialogProps = {
  target: DetailTarget | null
  onOpenChange: (open: boolean) => void
}

/**
 * Os lançamentos por trás de um número da tabela. Vale a pena abrir: é aqui que "R$ 1.240
 * em Alimentação fora" vira "três jantares e um delivery".
 *
 * Quando o lançamento está dividido em categorias, mostra **a parte que é desta categoria** —
 * senão a soma da lista não bateria com o número clicado.
 */
export function MonthlyDetailDialog({ target, onOpenChange }: MonthlyDetailDialogProps) {
  /*
   * O lançamento aberto para editar, por cima desta lista. Ficar mudando de tela para
   * corrigir uma descrição é o que quebra o fio de quem está analisando o relatório.
   */
  const [editando, setEditando] = useState<Transaction | null>(null)
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const { data: contacts = [] } = useContacts()
  const { data: transactions = [], isPending } = useTransactionSlice(
    target
      ? {
          from: target.from,
          to: target.to,
          categoryId: target.categoryId,
          type: target.type,
          basis: target.basis,
        }
      : null,
  )

  // A categoria clicada leva as subcategorias junto, como na tabela
  const daCategoria = new Set(
    target?.categoryId
      ? [
          target.categoryId,
          ...categories
            .filter((category) => category.parentId === target.categoryId)
            .map((category) => category.id),
        ]
      : [],
  )

  const parteDe = (splits: { categoryId: string | null; amountCents: number }[]) =>
    splits
      .filter((split) =>
        target?.categoryId ? daCategoria.has(split.categoryId ?? '') : split.categoryId === null,
      )
      .reduce((total, split) => total + split.amountCents, 0)

  const linhas = transactions.map((transaction) => ({
    transaction,
    parte: parteDe(transaction.splits),
  }))
  const total = linhas.reduce((soma, linha) => soma + linha.parte, 0)

  const nomeDaCategoria = (categoryId: string | null) => {
    const category = categories.find((item) => item.id === categoryId)
    if (!category) return 'Sem categoria'
    const pai = category.parentId
      ? categories.find((item) => item.id === category.parentId)
      : undefined
    return pai ? `${pai.name} › ${category.name}` : category.name
  }

  /*
   * A segunda linha de cada lançamento: onde ele caiu e de onde veio. Quando o detalhe é de
   * uma principal, a subcategoria de verdade aparece — é o que explica o número.
   */
  const detalhes = (transaction: Transaction) => {
    const account = accounts.find((item) => item.id === transaction.accountId)
    const contact = contacts.find((item) => item.id === transaction.contactId)
    const cartao = account && isCreditCard(account.type)
    const partes: string[] = []

    for (const split of transaction.splits) partes.push(nomeDaCategoria(split.categoryId))
    if (account)
      partes.push(
        cartao && transaction.statementMonth
          ? `${account.name} · fatura de ${shortMonthLabel(transaction.statementMonth)}`
          : account.name,
      )
    if (contact) partes.push(contact.name)
    if (transaction.installment) {
      partes.push(`parcela ${transaction.installment.number}/${transaction.installment.count}`)
    }
    // No regime de competência, dizer quando o dinheiro sai (e vice-versa)
    const outraData =
      target?.basis === 'cash'
        ? `comprado em ${shortDate(transaction.purchaseDate)}`
        : transaction.paymentDate
          ? `${cartao ? 'vence' : 'pago'} em ${shortDate(transaction.paymentDate)}`
          : 'sem data de pagamento'
    partes.push(outraData)
    if (transaction.origin === 'ofx') partes.push('importado')
    partes.push(`por ${transaction.createdByName.split(' ')[0]}`)
    return partes.join(' · ')
  }

  return (
    <>
      <Dialog open={target !== null} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85dvh] flex-col gap-4 sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="first-letter:uppercase">
              {target?.name} · {target?.periodLabel}
            </DialogTitle>
            <DialogDescription>
              {linhas.length === 1 ? '1 lançamento' : `${linhas.length} lançamentos`} ·{' '}
              {reportBasisLabels[target?.basis ?? 'accrual'].toLowerCase()}
            </DialogDescription>
          </DialogHeader>

          {isPending ? (
            <p className="text-muted-foreground text-sm">Carregando…</p>
          ) : linhas.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="Nenhum lançamento aqui"
              text="Pode ser que ele tenha sido apagado agora há pouco."
            />
          ) : (
            <ul className="-mx-2 min-h-0 flex-1 divide-y overflow-y-auto">
              {linhas.map(({ transaction, parte }) => (
                <li key={transaction.id}>
                  <button
                    type="button"
                    onClick={() => setEditando(transaction)}
                    title="Abrir para editar"
                    aria-label={`Editar ${transaction.description || 'lançamento sem descrição'}`}
                    className="flex w-full items-baseline gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="w-12 shrink-0 text-muted-foreground text-xs tabular-nums">
                      {shortDate(
                        target?.basis === 'cash'
                          ? (transaction.paymentDate ?? transaction.purchaseDate)
                          : transaction.purchaseDate,
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm">
                        {transaction.description || 'Sem descrição'}
                      </span>
                      <span className="text-muted-foreground text-xs leading-snug">
                        {detalhes(transaction)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-sm tabular-nums">
                      <span className={amountTone[transaction.type]}>
                        {formatSignedCents(transaction.type, parte)}
                      </span>
                      {/* Dividido entre categorias: mostra de quanto era o lançamento inteiro */}
                      {parte !== transaction.amountCents && (
                        <span className="block text-muted-foreground text-xs">
                          de {formatCents(transaction.amountCents)}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {linhas.length > 0 && (
            <div className="flex items-baseline justify-between border-t pt-3 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium tabular-nums">{formatCents(total)}</span>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/*
       * Irmão, não aninhado: aninhado, o Base UI esconde o de baixo. Os dois ficam na mesma
       * camada — o de editar cobre a lista, e fechá-lo devolve o detalhamento como estava.
       * Subir a camada deste seria pior: os seletores (contato, categoria, conta) abrem em
       * z-50 e passariam a aparecer **atrás** do formulário.
       */}
      <TransactionFormDialog
        open={editando !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setEditando(null)
        }}
        transaction={editando}
        month={(editando?.purchaseDate ?? '').slice(0, 7)}
      />
    </>
  )
}
