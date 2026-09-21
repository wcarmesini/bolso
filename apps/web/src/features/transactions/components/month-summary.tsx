import type { Transaction } from '@bolso/shared'
import { StatGrid } from '@/components/stat-grid'
import { formatCents } from '@/lib/money'
import { amountTone, summarize } from '../amount'

/** Entradas, saídas e saldo do mês, contados no navegador com a lista que já está na tela */
export function MonthSummary({ transactions }: { transactions: Transaction[] }) {
  const { income, expense, balance } = summarize(transactions)
  return (
    <StatGrid
      stats={[
        { label: 'Entradas', value: formatCents(income), tone: amountTone.income },
        { label: 'Saídas', value: formatCents(expense) },
        {
          label: 'Saldo',
          value: formatCents(balance),
          tone: balance < 0 ? 'text-destructive' : undefined,
        },
      ]}
    />
  )
}
