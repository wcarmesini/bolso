import { type BudgetLine, type Category, categoryStyle, type TransactionType } from '@bolso/shared'
import { ChevronRight, PiggyBank } from 'lucide-react'
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
import { usePodeEditar } from '@/lib/access'
import { currentMonth } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { BudgetLimitDialog, type LimitTarget } from './budget-limit-dialog'

/** Com orçamento primeiro (as mais apertadas no topo), depois as que gastaram sem orçamento */
function porAtencao(a: BudgetLine, b: BudgetLine) {
  const rank = (line: BudgetLine) => (line.limitCents !== null ? 0 : line.spentCents > 0 ? 1 : 2)
  const uso = (line: BudgetLine) => (line.limitCents ? line.spentCents / line.limitCents : 0)
  return (
    rank(a) - rank(b) ||
    uso(b) - uso(a) ||
    b.spentCents - a.spentCents ||
    a.name.localeCompare(b.name, 'pt-BR')
  )
}

/** Linha vazia para uma categoria que ainda não tem orçamento nem movimento */
const linhaVazia = (category: Category): BudgetLine => ({
  categoryId: category.id,
  name: category.name,
  ...categoryStyle(category),
  limitCents: null,
  ownLimitCents: null,
  spentCents: 0,
  items: [],
  children: [],
})

export function BudgetPage() {
  const podeEditar = usePodeEditar()
  const [month, setMonth] = useState(currentMonth)
  const [target, setTarget] = useState<LimitTarget | null>(null)
  const [aberta, setAberta] = useState<Set<string>>(new Set())
  const { data: categories = [] } = useCategories()
  const { data: report, isPending, isError } = useBudgetReport(month)

  const alternar = (id: string) =>
    setAberta((atual) => {
      const proxima = new Set(atual)
      if (!proxima.delete(id)) proxima.add(id)
      return proxima
    })

  /*
   * Toda categoria principal aparece, mesmo sem orçamento nem movimento: é aqui que se define.
   * As subcategorias entram junto, para poder orçar no detalhe.
   */
  const secoes = useMemo(() => {
    const montar = (type: TransactionType, linhas: BudgetLine[] | undefined) => {
      const doRelatorio = new Map((linhas ?? []).map((line) => [line.categoryId, line]))
      return categories
        .filter((category) => !category.parentId && category.kind === type)
        .map((category) => {
          const line = doRelatorio.get(category.id) ?? linhaVazia(category)
          const comDados = new Map(line.children.map((child) => [child.categoryId, child]))
          const children = categories
            .filter((item) => item.parentId === category.id)
            .map((item) => comDados.get(item.id) ?? linhaVazia(item))
          return { ...line, children }
        })
        .sort(porAtencao)
    }
    return { expense: montar('expense', report?.expense), income: montar('income', report?.income) }
  }, [categories, report])

  const totais = (linhas: BudgetLine[]) => {
    const comOrcamento = linhas.filter((line) => line.limitCents !== null)
    return {
      orcado: comOrcamento.reduce((total, line) => total + (line.limitCents ?? 0), 0),
      realizado: comOrcamento.reduce((total, line) => total + line.spentCents, 0),
      fora: linhas
        .filter((line) => line.limitCents === null)
        .reduce((total, line) => total + line.spentCents, 0),
    }
  }

  const saidas = totais(secoes.expense)
  const entradas = totais(secoes.income)
  const sobra = saidas.orcado - saidas.realizado

  /** Abre o orçamento da linha já sabendo o espaço que ela tem dentro da principal */
  const abrirDialogo = (line: BudgetLine, kind: TransactionType, principal?: BudgetLine) => {
    // Definir um limite é gravar: para quem só vê, a linha continua clicável e não abre nada
    if (!podeEditar) return
    const orcadoNasFilhas = line.children.reduce(
      (total, child) => total + (child.limitCents ?? 0),
      0,
    )
    const usadoPelasIrmas =
      principal?.children.reduce(
        (total, child) =>
          child.categoryId === line.categoryId ? total : total + (child.limitCents ?? 0),
        0,
      ) ?? 0

    setTarget({
      categoryId: line.categoryId,
      name: line.name,
      limitCents: line.limitCents,
      items: line.items,
      kind,
      // Só trava quando a principal tem orçamento PRÓPRIO; o dela somado das filhas não limita nada
      cabe:
        principal && principal.ownLimitCents !== null
          ? {
              ate: Math.max(principal.ownLimitCents - usadoPelasIrmas, 0),
              principal: principal.name,
            }
          : null,
      minimo: orcadoNasFilhas > 0 ? orcadoNasFilhas : null,
    })
  }

  return (
    <>
      <PageHeader title="Orçamento" />
      <PageBody>
        <MonthNav month={month} onChange={setMonth} />

        {isError ? (
          <p className="text-destructive text-sm">Não foi possível carregar o orçamento.</p>
        ) : isPending && !report ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : secoes.expense.length === 0 && secoes.income.length === 0 ? (
          <EmptyState
            icon={PiggyBank}
            title="Nenhuma categoria ainda"
            text="Crie categorias em Ajustes para definir quanto quer gastar em cada uma."
          />
        ) : (
          <>
            <StatGrid
              stats={[
                { label: 'Orçado', value: formatCents(saidas.orcado) },
                { label: 'Gasto', value: formatCents(saidas.realizado) },
                sobra >= 0
                  ? { label: 'Resta', value: formatCents(sobra) }
                  : { label: 'Passou', value: formatCents(-sobra), tone: 'text-destructive' },
              ]}
            >
              {saidas.orcado > 0 && (
                <ProgressBar
                  ratio={saidas.realizado / saidas.orcado}
                  label="Uso do orçamento do mês"
                />
              )}
              {saidas.fora > 0 && (
                <p className="text-muted-foreground text-xs">
                  Mais {formatCents(saidas.fora)} em categorias sem orçamento.
                </p>
              )}
              {saidas.orcado === 0 && (
                <p className="text-muted-foreground text-xs">
                  Toque numa categoria para definir quanto quer gastar nela por mês.
                </p>
              )}
            </StatGrid>

            <Secao
              titulo="Entradas"
              resumo={
                entradas.orcado > 0
                  ? `${formatCents(entradas.realizado)} de ${formatCents(entradas.orcado)} previstos`
                  : undefined
              }
              linhas={secoes.income}
              aberta={aberta}
              onAlternar={alternar}
              onEscolher={(line, principal) => abrirDialogo(line, 'income', principal)}
              entrada
            />

            <Secao
              titulo="Saídas"
              linhas={secoes.expense}
              aberta={aberta}
              onAlternar={alternar}
              onEscolher={(line, principal) => abrirDialogo(line, 'expense', principal)}
            />
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

type SecaoProps = {
  titulo: string
  resumo?: string
  linhas: BudgetLine[]
  aberta: Set<string>
  onAlternar: (id: string) => void
  onEscolher: (line: BudgetLine, principal?: BudgetLine) => void
  entrada?: boolean
}

function Secao({ titulo, resumo, linhas, aberta, onAlternar, onEscolher, entrada }: SecaoProps) {
  if (linhas.length === 0) return null
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-muted-foreground text-xs">{titulo}</h2>
        {resumo && <span className="text-muted-foreground text-xs tabular-nums">{resumo}</span>}
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {linhas.map((line) => (
          <li key={line.categoryId}>
            <Linha
              line={line}
              entrada={entrada}
              expansivel={line.children.length > 0}
              aberta={aberta.has(line.categoryId)}
              onAlternar={() => onAlternar(line.categoryId)}
              onEscolher={() => onEscolher(line)}
            />
            {aberta.has(line.categoryId) && (
              <ul className="border-t bg-muted/20">
                {line.children.map((child) => (
                  <li key={child.categoryId}>
                    <Linha
                      line={child}
                      entrada={entrada}
                      filha
                      onEscolher={() => onEscolher(child, line)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

type LinhaProps = {
  line: BudgetLine
  entrada?: boolean
  filha?: boolean
  expansivel?: boolean
  aberta?: boolean
  onAlternar?: () => void
  onEscolher: () => void
}

function Linha({ line, entrada, filha, expansivel, aberta, onAlternar, onEscolher }: LinhaProps) {
  const limite = line.limitCents
  const uso = limite ? line.spentCents / limite : line.spentCents > 0 ? 1 : 0
  const tom = usageTone(uso)
  const style = categoryStyle(line)

  return (
    <div className={`flex items-center gap-2 ${filha ? 'py-2 pr-4 pl-4' : 'px-4 py-3'}`}>
      {expansivel ? (
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={aberta}
          aria-label={`${aberta ? 'Fechar' : 'Abrir'} as subcategorias de ${line.name}`}
          className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className={`size-3.5 transition-transform ${aberta ? 'rotate-90' : ''}`} />
        </button>
      ) : (
        <span className={filha ? 'w-6' : 'w-4'} />
      )}

      <button
        type="button"
        onClick={onEscolher}
        aria-label={`${line.name}: ${limite === null ? 'definir orçamento' : 'mudar orçamento'}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
      >
        {!filha && <CategoryBadge icon={style.icon} color={style.color} />}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5 py-0.5">
          <span className="flex items-baseline justify-between gap-2">
            <span className={`truncate ${filha ? 'text-muted-foreground text-sm' : 'text-sm'}`}>
              {line.name}
            </span>
            <span className="shrink-0 text-sm tabular-nums">
              {limite === null ? (
                line.spentCents > 0 ? (
                  formatCents(line.spentCents)
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {entrada ? 'Prever' : 'Definir'}
                  </span>
                )
              ) : (
                <>
                  {formatCents(line.spentCents)}
                  <span className="text-muted-foreground"> de {formatCents(limite)}</span>
                </>
              )}
            </span>
          </span>

          {limite !== null && (
            <>
              {/* Na entrada, encher a barra é bom: a escala de "estourou" não vale aqui */}
              <ProgressBar
                ratio={uso}
                className={entrada ? 'bg-emerald-500' : undefined}
                label={
                  entrada ? `Quanto já entrou de ${line.name}` : `Uso do orçamento de ${line.name}`
                }
              />
              <span className={`text-xs ${entrada ? 'text-muted-foreground' : tom.text}`}>
                {entrada
                  ? line.spentCents >= limite
                    ? `Meta batida (+${formatCents(line.spentCents - limite)})`
                    : `Faltam ${formatCents(limite - line.spentCents)}`
                  : line.spentCents <= limite
                    ? `Resta ${formatCents(limite - line.spentCents)}`
                    : `Passou ${formatCents(line.spentCents - limite)}`}
                {/* O detalhamento fica no diálogo; aqui só a menção de que existe */}
                {line.items.length > 0 &&
                  ` · ${line.items.length} ${line.items.length === 1 ? 'item' : 'itens'}`}
              </span>
            </>
          )}
        </span>
      </button>
    </div>
  )
}
