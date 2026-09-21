import { type Account, cardCycleOf, statementDates, type Transaction } from '@bolso/shared'
import { StatGrid } from '@/components/stat-grid'
import { shortDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { summarize } from '../amount'

/** O topo da fatura: total, quando fecha e quando vence (e o limite, se houver) */
export function StatementSummary({
  account,
  month,
  transactions,
}: {
  account: Account
  month: string
  transactions: Transaction[]
}) {
  const cycle = cardCycleOf(account)
  if (!cycle) return null
  const { closingDate, dueDate } = statementDates(month, cycle)
  // Estorno e cashback entram como receita no cartão e abatem da fatura
  const { income, expense } = summarize(transactions)
  const total = expense - income

  return (
    <StatGrid
      stats={[
        { label: 'Total da fatura', value: formatCents(total), strong: true },
        { label: 'Fecha em', value: shortDate(closingDate) },
        { label: 'Vence em', value: shortDate(dueDate) },
        ...(account.limitCents
          ? [{ label: 'Limite', value: formatCents(account.limitCents) }]
          : []),
      ]}
    />
  )
}
