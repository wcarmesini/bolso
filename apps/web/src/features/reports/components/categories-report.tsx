import { type CategoryTotal, isTransactionType, type TransactionType } from '@bolso/shared'
import { ChartPie, Tag } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { MonthNav } from '@/components/month-nav'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { categoryColorStyles } from '@/features/categories/colors'
import { CategoryBadge } from '@/features/categories/components/category-badge'
import { currentMonth } from '@/lib/dates'
import { formatCents, formatShare } from '@/lib/money'
import { useCategoriesReport } from '../queries'

const typeItems: { value: TransactionType; label: string }[] = [
  { value: 'expense', label: 'Despesas' },
  { value: 'income', label: 'Receitas' },
]

// "Sem categoria" não tem cor própria: fica neutra
const swatchOf = (line: CategoryTotal) =>
  line.color ? categoryColorStyles[line.color].swatch : 'bg-muted-foreground/40'

/**
 * Para onde o dinheiro foi no mês, pela data da compra. Um lançamento dividido conta o pedaço
 * certo em cada categoria, e as subcategorias aparecem dentro da principal.
 */
export function CategoriesReport() {
  const [month, setMonth] = useState(currentMonth)
  const [type, setType] = useState<TransactionType>('expense')
  const { data, isPending, isError } = useCategoriesReport(month, type)

  const lines = data?.categories ?? []
  const total = data?.totalCents ?? 0
  const max = lines[0]?.totalCents ?? 1

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav month={month} onChange={setMonth} />
        <ToggleGroup
          variant="outline"
          spacing={0}
          size="sm"
          value={[type]}
          onValueChange={(next) => {
            if (isTransactionType(next[0])) setType(next[0])
          }}
        >
          {typeItems.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar.</p>
      ) : isPending && !data ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : lines.length === 0 ? (
        <EmptyState
          icon={ChartPie}
          title={type === 'expense' ? 'Nenhum gasto neste mês' : 'Nenhuma receita neste mês'}
          text="Assim que houver lançamentos, a divisão por categoria aparece aqui."
        />
      ) : (
        <div className={`flex flex-col gap-4 ${isPending ? 'opacity-60' : ''}`}>
          <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-muted-foreground text-xs">
                {type === 'expense' ? 'Total gasto' : 'Total recebido'}
              </span>
              <span className="font-semibold tabular-nums">{formatCents(total)}</span>
            </div>
            {/* Cada categoria ocupa a fatia dela do total */}
            <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-muted">
              {lines.map((line) => (
                <div
                  key={line.categoryId ?? 'sem-categoria'}
                  title={`${line.name}: ${formatShare(line.totalCents, total)}`}
                  className={swatchOf(line)}
                  style={{ width: `${(line.totalCents / total) * 100}%` }}
                />
              ))}
            </div>
          </div>

          <ul className="divide-y rounded-xl border bg-card">
            {lines.map((line) => (
              <li
                key={line.categoryId ?? 'sem-categoria'}
                className="flex flex-col gap-2 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  {line.icon && line.color ? (
                    <CategoryBadge icon={line.icon} color={line.color} />
                  ) : (
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Tag className="size-4" />
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm">{line.name}</span>
                      <span className="shrink-0 text-sm tabular-nums">
                        {formatCents(line.totalCents)}
                        <span className="ml-1.5 text-muted-foreground text-xs">
                          {formatShare(line.totalCents, total)}
                        </span>
                      </span>
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${swatchOf(line)}`}
                        style={{ width: `${(line.totalCents / max) * 100}%` }}
                      />
                    </div>
                  </span>
                </div>
                {line.children.length > 0 && (
                  <ul className="ml-12 flex flex-col gap-1">
                    {line.children.map((child) => (
                      <li
                        key={child.categoryId}
                        className="flex items-baseline justify-between gap-2 text-muted-foreground text-xs"
                      >
                        <span className="truncate">{child.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {formatCents(child.totalCents)}
                        </span>
                      </li>
                    ))}
                    {/* O que foi lançado direto na principal, sem subcategoria */}
                    {line.categoryId && remainder(line) > 0 && (
                      <li className="flex items-baseline justify-between gap-2 text-muted-foreground text-xs">
                        <span className="truncate">Sem subcategoria</span>
                        <span className="shrink-0 tabular-nums">
                          {formatCents(remainder(line))}
                        </span>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

const remainder = (line: CategoryTotal) =>
  line.totalCents - line.children.reduce((total, child) => total + child.totalCents, 0)
