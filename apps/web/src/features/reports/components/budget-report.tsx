import { type BudgetLine, categoryStyle } from '@bolso/shared'
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

  const secao = (linhas: BudgetLine[], entrada: boolean) => {
    const comOrcamento = linhas.filter((line) => line.limitCents !== null)
    const semOrcamento = linhas.filter((line) => line.limitCents === null && line.spentCents > 0)
    const orcado = comOrcamento.reduce((total, line) => total + (line.limitCents ?? 0), 0)
    const realizado = comOrcamento.reduce((total, line) => total + line.spentCents, 0)
    return { comOrcamento, semOrcamento, orcado, realizado, entrada }
  }

  const saidas = secao(data?.expense ?? [], false)
  const entradas = secao(data?.income ?? [], true)
  const diferenca = saidas.orcado - saidas.realizado

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      {isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar.</p>
      ) : isPending && !data ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : saidas.comOrcamento.length === 0 && entradas.comOrcamento.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhum orçamento neste mês"
          text="Defina quanto quer gastar por categoria na tela Orçamento; ele vale dali em diante."
        />
      ) : (
        <div className={`flex flex-col gap-4 ${isPending ? 'opacity-60' : ''}`}>
          <StatGrid
            stats={[
              { label: 'Orçado', value: formatCents(saidas.orcado) },
              { label: 'Realizado', value: formatCents(saidas.realizado) },
              diferenca >= 0
                ? { label: 'Sobrou', value: formatCents(diferenca) }
                : { label: 'Estourou', value: formatCents(-diferenca), tone: 'text-destructive' },
            ]}
          >
            <ProgressBar
              ratio={saidas.realizado / Math.max(saidas.orcado, 1)}
              label="Uso do orçamento"
            />
          </StatGrid>

          {entradas.comOrcamento.length > 0 && (
            <Bloco titulo="Entradas previstas" linhas={entradas.comOrcamento} entrada />
          )}
          <Bloco titulo="Saídas" linhas={saidas.comOrcamento} />
          {saidas.semOrcamento.length > 0 && (
            <Bloco titulo="Gastos sem orçamento" linhas={saidas.semOrcamento} simples />
          )}
        </div>
      )}

      <div>
        <Button variant="outline" size="sm" nativeButton={false} render={<Link to="/orcamento" />}>
          Ajustar orçamento
        </Button>
      </div>
    </>
  )
}

type BlocoProps = { titulo: string; linhas: BudgetLine[]; simples?: boolean; entrada?: boolean }

function Bloco({ titulo, linhas, simples, entrada }: BlocoProps) {
  return (
    <section className="flex flex-col gap-1.5">
      <h2 className="px-1 text-muted-foreground text-xs">{titulo}</h2>
      <ul className="divide-y rounded-xl border bg-card">
        {linhas.map((line) => {
          const limite = line.limitCents ?? 0
          const uso = limite ? line.spentCents / limite : 1
          const style = categoryStyle(line)
          return (
            <li key={line.categoryId} className="flex items-center gap-3 px-4 py-3">
              <CategoryBadge icon={style.icon} color={style.color} />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm">{line.name}</span>
                  {simples ? (
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatCents(line.spentCents)}
                    </span>
                  ) : (
                    <span className={`shrink-0 text-xs tabular-nums ${usageTone(uso).text}`}>
                      {formatShare(line.spentCents, limite)}
                    </span>
                  )}
                </span>

                {!simples && (
                  <>
                    <ProgressBar ratio={uso} label={`Uso do orçamento de ${line.name}`} />
                    <span className="grid grid-cols-3 gap-2 text-muted-foreground text-xs tabular-nums">
                      <span>
                        {entrada ? 'Previsto' : 'Orçado'} {formatCents(limite)}
                      </span>
                      <span className="text-center">
                        {entrada ? 'Recebido' : 'Gasto'} {formatCents(line.spentCents)}
                      </span>
                      <span
                        className={`text-right ${!entrada && line.spentCents > limite ? 'text-destructive' : ''}`}
                      >
                        {line.spentCents > limite
                          ? `+${formatCents(line.spentCents - limite)}`
                          : `−${formatCents(limite - line.spentCents)}`}
                      </span>
                    </span>

                    {/* Detalhamento e subcategorias, quando existem */}
                    {(line.items.length > 0 || line.children.length > 0) && (
                      <span className="flex flex-col gap-0.5 text-muted-foreground text-xs">
                        {line.items.map((item) => (
                          <span key={item.name} className="flex justify-between gap-2">
                            <span className="truncate">{item.name}</span>
                            <span className="tabular-nums">{formatCents(item.amountCents)}</span>
                          </span>
                        ))}
                        {line.children.map((child) => (
                          <span key={child.categoryId} className="flex justify-between gap-2">
                            <span className="truncate">{child.name}</span>
                            <span className="tabular-nums">
                              {formatCents(child.spentCents)}
                              {child.limitCents !== null && ` de ${formatCents(child.limitCents)}`}
                            </span>
                          </span>
                        ))}
                      </span>
                    )}
                  </>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
