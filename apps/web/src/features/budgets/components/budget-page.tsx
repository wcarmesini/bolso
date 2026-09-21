import { type BudgetLine, categoryStyle } from '@bolso/shared'
import { PiggyBank } from 'lucide-react'
import { useMemo, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { MonthNav } from '@/components/month-nav'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'
import { ProgressBar, usageTone } from '@/components/progress-bar'
import { StatGrid } from '@/components/stat-grid'
import { CategoryBadge } from '@/features/categories/components/category-badge'
import { useCategories } from '@/features/categories/queries'
import { useBudgetReport } from '@/features/reports/queries'
import { currentMonth } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { BudgetLimitDialog, type LimitTarget } from './budget-limit-dialog'

/** Com limite primeiro (as mais usadas no topo), depois as que gastaram sem limite, depois o resto */
function byAttention(a: BudgetLine, b: BudgetLine) {
  const rank = (line: BudgetLine) => (line.limitCents !== null ? 0 : line.spentCents > 0 ? 1 : 2)
  const ratio = (line: BudgetLine) => (line.limitCents ? line.spentCents / line.limitCents : 0)
  return (
    rank(a) - rank(b) ||
    ratio(b) - ratio(a) ||
    b.spentCents - a.spentCents ||
    a.name.localeCompare(b.name, 'pt-BR')
  )
}

export function BudgetPage() {
  const [month, setMonth] = useState(currentMonth)
  const [target, setTarget] = useState<LimitTarget | null>(null)
  const { data: categories = [] } = useCategories()
  const { data: report, isPending, isError } = useBudgetReport(month)

  // Toda categoria principal de despesa aparece, mesmo sem limite nem gasto, para poder definir
  const lines = useMemo(() => {
    const fromReport = new Map(report?.lines.map((line) => [line.categoryId, line]))
    return categories
      .filter((category) => !category.parentId && category.kind === 'expense')
      .map(
        (category): BudgetLine =>
          fromReport.get(category.id) ?? {
            categoryId: category.id,
            name: category.name,
            ...categoryStyle(category),
            limitCents: null,
            spentCents: 0,
          },
      )
      .sort(byAttention)
  }, [categories, report])

  const withLimit = lines.filter((line) => line.limitCents !== null)
  const planned = withLimit.reduce((total, line) => total + (line.limitCents ?? 0), 0)
  const spent = withLimit.reduce((total, line) => total + line.spentCents, 0)
  const outside = lines
    .filter((line) => line.limitCents === null)
    .reduce((total, line) => total + line.spentCents, 0)
  const left = planned - spent

  return (
    <>
      <PageHeader title="Orçamento" />
      <PageBody>
        <MonthNav month={month} onChange={setMonth} />

        {isError ? (
          <p className="text-destructive text-sm">Não foi possível carregar o orçamento.</p>
        ) : isPending ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : lines.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="Nenhuma categoria de despesa"
            text="Crie categorias em Ajustes para definir quanto quer gastar em cada uma."
          />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Orçado', value: formatCents(planned) },
                { label: 'Gasto', value: formatCents(spent) },
                left >= 0
                  ? { label: 'Resta', value: formatCents(left) }
                  : { label: 'Passou', value: formatCents(-left), tone: 'text-destructive' },
              ]}
            >
              {planned > 0 && (
                <ProgressBar ratio={spent / planned} label="Uso do orçamento do mês" />
              )}
              {outside > 0 && (
                <p className="text-muted-foreground text-xs">
                  Mais {formatCents(outside)} em categorias sem limite.
                </p>
              )}
              {planned === 0 && (
                <p className="text-muted-foreground text-xs">
                  Toque numa categoria para definir quanto quer gastar nela por mês.
                </p>
              )}
            </StatGrid>

            <ul className="divide-y rounded-xl border bg-card">
              {lines.map((line) => (
                <li key={line.categoryId}>
                  <BudgetRow
                    line={line}
                    onSelect={() =>
                      setTarget({
                        categoryId: line.categoryId,
                        name: line.name,
                        limitCents: line.limitCents,
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </PageBody>

      <BudgetLimitDialog
        target={target}
        month={month}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
      />
    </>
  )
}

function BudgetRow({ line, onSelect }: { line: BudgetLine; onSelect: () => void }) {
  const style = categoryStyle(line)
  const limit = line.limitCents
  const ratio = limit ? line.spentCents / limit : line.spentCents > 0 ? 1 : 0
  const tone = usageTone(ratio)

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`${line.name}: ${limit === null ? 'definir limite' : 'mudar limite'}`}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
    >
      <CategoryBadge icon={style.icon} color={style.color} />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm">{line.name}</span>
          <span className="shrink-0 text-sm tabular-nums">
            {limit === null ? (
              line.spentCents > 0 ? (
                formatCents(line.spentCents)
              ) : (
                <span className="text-muted-foreground text-xs">Definir limite</span>
              )
            ) : (
              <>
                {formatCents(line.spentCents)}
                <span className="text-muted-foreground"> de {formatCents(limit)}</span>
              </>
            )}
          </span>
        </span>
        {limit !== null && <ProgressBar ratio={ratio} label={`Uso do limite de ${line.name}`} />}
        {limit !== null ? (
          <span className={`text-xs ${tone.text}`}>
            {line.spentCents <= limit
              ? `Resta ${formatCents(limit - line.spentCents)}`
              : `Passou ${formatCents(line.spentCents - limit)}`}
          </span>
        ) : (
          line.spentCents > 0 && <span className="text-muted-foreground text-xs">Sem limite</span>
        )}
      </span>
    </button>
  )
}
