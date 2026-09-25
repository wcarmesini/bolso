import { useState } from 'react'
import { StatGrid } from '@/components/stat-grid'
import { amountTone } from '@/features/transactions/amount'
import { currentMonth, monthLabel, shortMonthLabel } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useCashFlow } from '../queries'
import { thisYear, YearNav } from './year-nav'

// Zero vira um traço discreto: uma tabela cheia de "R$ 0,00" esconde o que importa
const money = (cents: number) =>
  cents === 0 ? <span className="text-muted-foreground/50">—</span> : formatCents(cents)

// Altura da barra em relação ao maior valor do ano; um valor pequeno ainda aparece
const barHeight = (value: number, max: number) =>
  value > 0 ? `max(2px, ${(value / max) * 100}%)` : '0'

/**
 * Entradas e saídas mês a mês, pelo dia em que o dinheiro se move. Meses que ainda não
 * chegaram mostram o que já está agendado: parcelas, faturas do cartão e contas a pagar.
 */
export function CashFlowReport() {
  const [year, setYear] = useState(thisYear)
  const { data, isPending, isError } = useCashFlow(year)
  const now = currentMonth()

  if (isError) return <p className="text-destructive text-sm">Não foi possível carregar.</p>

  const months = data?.months ?? []
  const income = months.reduce((total, item) => total + item.incomeCents, 0)
  const expense = months.reduce((total, item) => total + item.expenseCents, 0)
  const max = Math.max(1, ...months.flatMap((item) => [item.incomeCents, item.expenseCents]))
  let accumulated = 0

  return (
    <>
      <YearNav year={year} onChange={setYear} />

      <StatGrid
        stats={[
          { label: 'Entradas no ano', value: formatCents(income), tone: amountTone.income },
          { label: 'Saídas no ano', value: formatCents(expense) },
          {
            label: 'Saldo do ano',
            value: formatCents(income - expense),
            tone: income - expense < 0 ? 'text-destructive' : undefined,
          },
        ]}
      />

      <figure
        aria-label={`Entradas e saídas por mês em ${year}`}
        className={`flex flex-col gap-3 rounded-xl border bg-card p-4 ${isPending ? 'opacity-60' : ''}`}
      >
        <div className="flex h-44 items-end gap-1 sm:gap-2">
          {months.map((item) => (
            <div
              key={item.month}
              title={`${monthLabel(item.month)}: entrou ${formatCents(item.incomeCents)}, saiu ${formatCents(item.expenseCents)}`}
              className={`flex h-full flex-1 flex-col items-center gap-1.5 ${item.month > now ? 'opacity-50' : ''}`}
            >
              <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                <div
                  className="w-full max-w-3 rounded-t-sm bg-emerald-500"
                  style={{ height: barHeight(item.incomeCents, max) }}
                />
                <div
                  className="w-full max-w-3 rounded-t-sm bg-foreground/60"
                  style={{ height: barHeight(item.expenseCents, max) }}
                />
              </div>
              <span
                className={`text-[10px] ${item.month === now ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
              >
                {shortMonthLabel(item.month).split('/')[0]}
              </span>
            </div>
          ))}
        </div>
        <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-emerald-500" /> Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-foreground/60" /> Saídas
          </span>
          <span>Meses apagados: o que já está agendado.</span>
        </figcaption>
      </figure>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-muted-foreground text-xs">
            <tr className="border-b">
              <th className="px-4 py-2 text-left font-normal">Mês</th>
              <th className="px-2 py-2 text-right font-normal">Entradas</th>
              <th className="px-2 py-2 text-right font-normal">Saídas</th>
              <th className="px-4 py-2 text-right font-normal">Saldo</th>
              <th className="hidden px-4 py-2 text-right font-normal sm:table-cell">Acumulado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {months.map((item) => {
              const balance = item.incomeCents - item.expenseCents
              accumulated += balance
              return (
                <tr key={item.month} className={item.month > now ? 'text-muted-foreground' : ''}>
                  <td className="px-4 py-2 first-letter:uppercase">
                    {shortMonthLabel(item.month).split('/')[0]}
                    {item.month > now && <span className="ml-1.5 text-[11px]">previsto</span>}
                  </td>
                  <td className="px-2 py-2 text-right">{money(item.incomeCents)}</td>
                  <td className="px-2 py-2 text-right">{money(item.expenseCents)}</td>
                  <td className={`px-4 py-2 text-right ${balance < 0 ? 'text-destructive' : ''}`}>
                    {money(balance)}
                  </td>
                  <td
                    className={`hidden px-4 py-2 text-right sm:table-cell ${accumulated < 0 ? 'text-destructive' : ''}`}
                  >
                    {money(accumulated)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
