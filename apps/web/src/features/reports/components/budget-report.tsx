import { categoryStyle } from '@bolso/shared'
import { Link } from '@tanstack/react-router'
import { Target } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { MonthNav } from '@/components/month-nav'
import { ProgressBar, usageTone } from '@/components/progress-bar'
import { StatGrid } from '@/components/stat-grid'
import { Button } from '@/components/ui/button'
import { CategoryBadge } from '@/features/categories/components/category-badge'
import { currentMonth } from '@/lib/dates'
import { formatCents, formatShare } from '@/lib/money'
import { useBudgetReport } from '../queries'

/**
 * Quanto de cada limite foi usado no mês. É a leitura do orçamento; para mudar os limites,
 * a tela Orçamento (o link no fim).
 */
export function BudgetReport() {
  const [month, setMonth] = useState(currentMonth)
  const { data, isPending, isError } = useBudgetReport(month)

  const lines = data?.lines ?? []
  const planned = lines.filter((line) => line.limitCents !== null)
  const unplanned = lines.filter((line) => line.limitCents === null && line.spentCents > 0)
  const limitTotal = planned.reduce((total, line) => total + (line.limitCents ?? 0), 0)
  const spentTotal = planned.reduce((total, line) => total + line.spentCents, 0)
  const difference = limitTotal - spentTotal

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      {isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar.</p>
      ) : isPending && !data ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : planned.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhum limite neste mês"
          text="Defina quanto quer gastar por categoria na tela Orçamento; ele vale dali em diante."
        />
      ) : (
        <div className={`flex flex-col gap-4 ${isPending ? 'opacity-60' : ''}`}>
          <StatGrid
            stats={[
              { label: 'Orçado', value: formatCents(limitTotal) },
              { label: 'Realizado', value: formatCents(spentTotal) },
              difference >= 0
                ? { label: 'Sobrou', value: formatCents(difference) }
                : { label: 'Estourou', value: formatCents(-difference), tone: 'text-destructive' },
            ]}
          >
            <ProgressBar ratio={spentTotal / Math.max(limitTotal, 1)} label="Uso do orçamento" />
          </StatGrid>

          <ul className="divide-y rounded-xl border bg-card">
            {planned.map((line) => {
              const limit = line.limitCents ?? 0
              const ratio = limit ? line.spentCents / limit : 1
              const style = categoryStyle(line)
              return (
                <li key={line.categoryId} className="flex items-center gap-3 px-4 py-3">
                  <CategoryBadge icon={style.icon} color={style.color} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm">{line.name}</span>
                      <span className={`shrink-0 text-xs tabular-nums ${usageTone(ratio).text}`}>
                        {formatShare(line.spentCents, limit)}
                      </span>
                    </span>
                    <ProgressBar ratio={ratio} label={`Uso do limite de ${line.name}`} />
                    <span className="grid grid-cols-3 gap-2 text-muted-foreground text-xs tabular-nums">
                      <span>Orçado {formatCents(limit)}</span>
                      <span className="text-center">Gasto {formatCents(line.spentCents)}</span>
                      <span
                        className={`text-right ${line.spentCents > limit ? 'text-destructive' : ''}`}
                      >
                        {line.spentCents > limit
                          ? `−${formatCents(line.spentCents - limit)}`
                          : `+${formatCents(limit - line.spentCents)}`}
                      </span>
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>

          {unplanned.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <h2 className="px-1 text-muted-foreground text-xs">Gastos sem limite</h2>
              <ul className="divide-y rounded-xl border bg-card">
                {unplanned.map((line) => {
                  const style = categoryStyle(line)
                  return (
                    <li key={line.categoryId} className="flex items-center gap-3 px-4 py-2.5">
                      <CategoryBadge icon={style.icon} color={style.color} />
                      <span className="min-w-0 flex-1 truncate text-sm">{line.name}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {formatCents(line.spentCents)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      <div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/orcamento" />}>
          Ajustar limites
        </Button>
      </div>
    </>
  )
}
