import {
  addMonthsToMonth,
  daysInMonth,
  type MonthlyInterval,
  type MonthlyPeriod,
  type MonthlyRow,
  type MonthlySection,
  monthlyIntervals,
  monthsPerInterval,
  parseMonth,
  type ReportBasis,
  reportBases,
  type TransactionType,
} from '@bolso/shared'
import { ChevronRight, Table } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { CategoryBadge } from '@/features/categories/components/category-badge'
import { useCategories } from '@/features/categories/queries'
import { useDragScroll } from '@/hooks/use-drag-scroll'
import { umDe, useRemembered } from '@/hooks/use-remembered'
import { currentMonth, shortMonthLabel } from '@/lib/dates'
import { formatCents, formatPercent, formatSharePrecise } from '@/lib/money'
import { useMonthlyReport } from '../queries'
import { type DetailTarget, MonthlyDetailDialog } from './monthly-detail-dialog'
import {
  CONTAGENS,
  extraColumns,
  extraLabels,
  intervalOptions,
  type MonthlyExtra,
  type MonthlyShow,
  type MonthlySort,
  MonthlyToolbar,
} from './monthly-toolbar'

/** "2026-10" → "out/26" · trimestre → "4º tri/26" · ano → "2026" */
function periodLabel(period: MonthlyPeriod, interval: MonthlyInterval) {
  const { year, month } = parseMonth(period.start)
  if (interval === 'year') return String(year)
  if (interval === 'quarter') {
    return `${Math.floor((month - 1) / 3) + 1}º tri/${String(year).slice(2)}`
  }
  return shortMonthLabel(period.start)
}

/** Trimestre começa em jan/abr/jul/out e ano em janeiro: a coluna precisa bater com o rótulo */
function alignStart(start: string, interval: MonthlyInterval) {
  const { year, month } = parseMonth(start)
  if (interval === 'year') return `${year}-01`
  if (interval === 'quarter') {
    return `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}`
  }
  return start
}

const valor = (cents: number) =>
  cents === 0 ? <span className="text-muted-foreground/40">—</span> : formatCents(cents)

/**
 * Variação em relação à coluna anterior. A cor diz se foi bom ou ruim, não a direção:
 * gastar mais é vermelho, receber mais é verde.
 */
function Variacao({
  atual,
  anterior,
  subirEhBom,
}: {
  atual: number
  anterior: number | undefined
  subirEhBom: boolean
}) {
  // Sem coluna anterior, sem mudança, ou coluna zerada: o selo não diria nada útil
  if (!anterior || atual === anterior || atual === 0) return null
  const mudanca = (atual - anterior) / Math.abs(anterior)
  if (Math.abs(mudanca) < 0.005) return null
  const subiu = mudanca > 0
  const bom = subiu === subirEhBom
  return (
    <span
      className={`shrink-0 rounded px-1 py-px text-[10px] tabular-nums ${
        bom
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
          : 'bg-destructive/10 text-destructive'
      }`}
    >
      {subiu ? '↑' : '↓'} {formatPercent(Math.abs(mudanca))}
    </span>
  )
}

function Celula({
  valores,
  indice,
  subirEhBom,
  forte,
  tom,
  onAbrir,
  aria,
  miuda,
  legenda,
  mostrarGrupo,
  mostrarReceita,
}: {
  valores: number[]
  indice: number
  subirEhBom: boolean
  forte?: boolean
  tom?: string
  /** Clicar mostra os lançamentos por trás do número */
  onAbrir?: () => void
  aria?: string
  miuda?: boolean
  /** Percentuais do período, em coluninhas à direita do número (ver `legendasDe`) */
  legenda?: Percentuais | null
  mostrarGrupo?: boolean
  mostrarReceita?: boolean
}) {
  const atual = valores[indice] ?? 0
  const conteudo = (
    <span className={`flex items-baseline justify-end gap-1.5 ${miuda ? 'text-xs' : ''}`}>
      <span className="flex items-center gap-1.5">
        <span
          className={`tabular-nums underline-offset-4 group-hover/celula:underline group-hover/celula:decoration-dotted group-focus-visible/celula:underline group-focus-visible/celula:decoration-dotted ${forte ? 'font-medium' : ''} ${tom ?? ''}`}
        >
          {valor(atual)}
        </span>
        {!miuda && (
          <Variacao atual={atual} anterior={valores[indice - 1]} subirEhBom={subirEhBom} />
        )}
      </span>
      {mostrarGrupo && <span className={colunaDoPercentual}>{legenda?.grupo ?? ''}</span>}
      {mostrarReceita && <span className={colunaDoPercentual}>{legenda?.receita ?? ''}</span>}
    </span>
  )
  return (
    <td className={miuda ? 'px-3 py-1.5 text-right' : 'px-3 py-2 text-right'}>
      {onAbrir && atual !== 0 ? (
        <button
          type="button"
          onClick={onAbrir}
          aria-label={aria}
          /* O sublinhado que convida ao clique fica só no número: os percentuais ao lado são leitura */
          className="group/celula w-full cursor-pointer text-right outline-none"
        >
          {conteudo}
        </button>
      ) : (
        conteudo
      )}
    </td>
  )
}

/** Último dia do período, para o recorte fechado que o detalhe pede */
const fimDoPeriodo = (period: MonthlyPeriod) => {
  const { year, month } = parseMonth(period.end)
  return `${period.end}-${String(daysInMonth(year, month)).padStart(2, '0')}`
}

/*
 * Os percentuais ficam **dentro** da célula, embaixo do número, em vez de virarem colunas no
 * fim: assim dá para ver o peso de cada linha mês a mês, e não só no total, sem alargar a
 * tabela. "% do grupo" é dentro da seção (ou da principal, para uma subcategoria) e
 * "% da receita" é sobre tudo o que entrou naquele período.
 */
export type Percentuais = { grupo: string | null; receita: string | null }

const legendasDe = (
  valores: number[],
  grupo: number[],
  receita: number[],
  extras: MonthlyExtra[],
): Percentuais[] =>
  valores.map((atual, indice) => {
    const base = grupo[indice] ?? 0
    const entrou = receita[indice] ?? 0
    return {
      grupo:
        extras.includes('shareOfGroup') && base > 0 && atual !== 0
          ? formatSharePrecise(atual / base)
          : null,
      receita:
        extras.includes('shareOfIncome') && entrou > 0 && atual !== 0
          ? formatSharePrecise(atual / entrou)
          : null,
    }
  })

/** Largura fixa: é o que alinha os percentuais com o %G e o %R do cabeçalho */
const colunaDoPercentual =
  'w-9 shrink-0 text-right text-[10px] text-muted-foreground/70 tabular-nums'

/**
 * O título da coluna com as siglas dos percentuais: **%G** é o peso dentro do grupo e **%R**
 * sobre a receita do período. Ficam na mesma largura dos números, que é o que alinha um
 * debaixo do outro sem precisar de coluna separada.
 */
function TituloDaColuna({
  children,
  mostrarGrupo,
  mostrarReceita,
}: {
  children: React.ReactNode
  mostrarGrupo: boolean
  mostrarReceita: boolean
}) {
  return (
    <span className="flex items-baseline justify-end gap-1.5">
      {children}
      {mostrarGrupo && (
        <span className={colunaDoPercentual} title="Peso dentro do grupo">
          %G
        </span>
      )}
      {mostrarReceita && (
        <span className={colunaDoPercentual} title="Peso sobre a receita do período">
          %R
        </span>
      )}
    </span>
  )
}

/**
 * A célula da coluna "Total". Reserva o espaço dos percentuais mesmo quando não tem nenhum:
 * sem isso, uma linha sem percentual empurra o número para a direita e a coluna deixa de
 * ficar alinhada com as outras.
 */
function CelulaDeTotal({
  children,
  legenda,
  mostrarGrupo,
  mostrarReceita,
  className = '',
}: {
  children: React.ReactNode
  legenda?: Percentuais | null
  mostrarGrupo: boolean
  mostrarReceita: boolean
  className?: string
}) {
  return (
    <td className={`px-3 text-right tabular-nums ${className}`}>
      <span className="flex items-baseline justify-end gap-1.5">
        {children}
        {mostrarGrupo && (
          <span className={`${colunaDoPercentual} font-normal`}>{legenda?.grupo ?? ''}</span>
        )}
        {mostrarReceita && (
          <span className={`${colunaDoPercentual} font-normal`}>{legenda?.receita ?? ''}</span>
        )}
      </span>
    </td>
  )
}

/** Primeira coluna: fica parada quando a tabela rola para o lado */
const fixa = 'sticky left-0 z-10 bg-card'

/**
 * Cada categoria em todos os períodos, com o total da linha — a leitura que mostra
 * sazonalidade ("o mercado subiu em dezembro") e o que cresceu sem ninguém perceber.
 * As categorias principais abrem para mostrar as subcategorias.
 */
export function MonthlyReport() {
  const { data: categories = [] } = useCategories()
  // O recorte fica lembrado; o começo do período não, para abrir sempre perto de hoje
  const [interval, setInterval] = useRemembered<MonthlyInterval>(
    'mes-a-mes:intervalo',
    'month',
    umDe(monthlyIntervals),
  )
  const [count, setCount] = useRemembered('mes-a-mes:periodos', 12, (value) =>
    CONTAGENS.includes(value as number),
  )
  // Começa mostrando até o mês atual, com a quantidade de colunas lembrada
  const [start, setStart] = useState(() =>
    alignStart(
      addMonthsToMonth(currentMonth(), -(count - 1) * monthsPerInterval[interval]),
      interval,
    ),
  )
  const [show, setShow] = useRemembered<MonthlyShow>(
    'mes-a-mes:mostrar',
    'all',
    umDe(['all', 'expense', 'income']),
  )
  const [sort, setSort] = useRemembered<MonthlySort>(
    'mes-a-mes:ordem',
    'total',
    umDe(['total', 'name', 'structure']),
  )
  const [basis, setBasis] = useRemembered<ReportBasis>(
    'mes-a-mes:regime',
    'accrual',
    umDe(reportBases),
  )
  const [extras, setExtras] = useRemembered<MonthlyExtra[]>(
    // Chave nova porque "Total" passou a ser opcional: a lista antiga não o mencionava e ele
    // sumiria de quem já usava a tela
    'mes-a-mes:colunas-2',
    ['total'],
    (value) => Array.isArray(value) && value.every((item) => extraColumns.includes(item)),
  )
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [detalhe, setDetalhe] = useState<DetailTarget | null>(null)

  const { data, isPending, isError } = useMonthlyReport({
    start: alignStart(start, interval),
    count,
    interval,
    basis,
  })
  const table = useDragScroll<HTMLDivElement>()

  /*
   * Mudar o recorte mexe no começo, nunca no fim: a última coluna é a que a pessoa está
   * olhando. Pedir "1 mês" quando se via até setembro mostra setembro — não um mês perdido
   * um ano atrás —, e voltar para "12 meses" recua o começo em vez de avançar para o futuro.
   */
  // O último mês do último período: num trimestre que começa em julho, o fim é setembro
  const fimDoRecorte = () => addMonthsToMonth(start, count * monthsPerInterval[interval] - 1)

  const recuarDoFim = (fim: string, colunas: number, intervalo: MonthlyInterval) =>
    alignStart(addMonthsToMonth(fim, -(colunas - 1) * monthsPerInterval[intervalo]), intervalo)

  const changeInterval = (next: MonthlyInterval) => {
    const columns = intervalOptions[next].defaultCount
    const fim = alignStart(fimDoRecorte(), next)
    setInterval(next)
    setCount(columns)
    setStart(recuarDoFim(fim, columns, next))
  }

  const changeCount = (next: number) => {
    const fim = fimDoRecorte()
    setCount(next)
    setStart(recuarDoFim(fim, next, interval))
  }

  const periods = data?.periods ?? []

  /*
   * A ordem por total já vem do servidor. "Nome" é preferência de leitura, e "estrutura" é a
   * ordem que a pessoa montou arrastando em Ajustes → Categorias — inclusive nas filhas, que
   * seguem a ordem dentro da principal.
   */
  const sections = useMemo(() => {
    const posicao = new Map(categories.map((category) => [category.id, category.position]))
    const daEstrutura = (categoryId: string | null) =>
      // "Sem categoria" não tem posição: fica por último
      categoryId ? (posicao.get(categoryId) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER

    const comparar = (a: { name: string; categoryId: string | null }, b: typeof a) =>
      sort === 'name'
        ? a.name.localeCompare(b.name, 'pt-BR')
        : daEstrutura(a.categoryId) - daEstrutura(b.categoryId) ||
          a.name.localeCompare(b.name, 'pt-BR')

    const ordenar = (section: MonthlySection | undefined) => {
      if (!section || sort === 'total') return section
      return {
        ...section,
        rows: [...section.rows]
          .sort(comparar)
          .map((row) => ({ ...row, children: [...row.children].sort(comparar) })),
      }
    }
    return { income: ordenar(data?.income), expense: ordenar(data?.expense) }
  }, [data, sort, categories])

  const expansiveis = [...(sections.income?.rows ?? []), ...(sections.expense?.rows ?? [])].filter(
    (row) => row.children.length > 0 && row.categoryId,
  )
  const allOpen =
    expansiveis.length > 0 && expansiveis.every((row) => open.has(row.categoryId ?? ''))

  const toggle = (id: string) =>
    setOpen((atual) => {
      const proximo = new Set(atual)
      if (!proximo.delete(id)) proximo.add(id)
      return proximo
    })

  const toggleAll = () =>
    setOpen(allOpen ? new Set() : new Set(expansiveis.map((row) => row.categoryId ?? '')))

  const toggleExtra = (extra: MonthlyExtra) =>
    setExtras(extras.includes(extra) ? extras.filter((item) => item !== extra) : [...extras, extra])

  /*
   * Coluna nova nasce fora da vista, à direita de tudo. Ao ligar uma, a tabela vai até lá —
   * senão a pessoa marca "Média" e parece que nada aconteceu. Ao abrir a tela, não: aí o
   * começo da tabela é o que interessa.
   */
  const colunasAntes = useRef(extras.length)
  useEffect(() => {
    if (extras.length > colunasAntes.current) {
      table.ref.current?.scrollTo({ left: table.ref.current.scrollWidth, behavior: 'smooth' })
    }
    colunasAntes.current = extras.length
  }, [extras.length, table.ref])

  const vazio =
    (sections.income?.totalCents ?? 0) === 0 && (sections.expense?.totalCents ?? 0) === 0
  const now = currentMonth()

  // Base do "% da receita": tudo o que entrou no período visto
  const receitaTotal = sections.income?.totalCents ?? 0
  const mostrarGrupo = extras.includes('shareOfGroup')
  const mostrarReceita = extras.includes('shareOfIncome')
  const mostrarTotal = extras.includes('total')

  const saldos = periods.map(
    (_, index) => (sections.income?.values[index] ?? 0) - (sections.expense?.values[index] ?? 0),
  )
  let acumulado = 0
  const acumulados = saldos.map((saldo) => {
    acumulado += saldo
    return acumulado
  })

  const secao = (
    titulo: string,
    section: MonthlySection | undefined,
    subirEhBom: boolean,
    tom: string | undefined,
    type: TransactionType,
  ) => {
    if (!section) return null
    // Na linha de título, "% do grupo" não diz nada (seria sempre 100%): fica só o da receita
    const semGrupo = extras.filter((extra) => extra !== 'shareOfGroup')
    const legendasDaSecao = legendasDe(
      section.values,
      section.values,
      sections.income?.values ?? [],
      semGrupo,
    )
    const legendaDoTotalDaSecao = legendasDe(
      [section.totalCents],
      [section.totalCents],
      [receitaTotal],
      semGrupo,
    )[0]
    return (
      <>
        <tr className="border-t bg-muted/30">
          <th
            scope="rowgroup"
            /* Opaco de propósito: `bg-muted/30` deixaria a tabela aparecer por baixo ao rolar */
            className={`${fixa} bg-[color-mix(in_oklab,var(--muted)_30%,var(--card))]! px-3 py-2 text-left font-medium`}
          >
            {titulo}
          </th>
          {periods.map((period, index) => (
            <Celula
              key={period.start}
              valores={section.values}
              indice={index}
              subirEhBom={subirEhBom}
              forte
              tom={tom}
              legenda={legendasDaSecao[index]}
              mostrarGrupo={mostrarGrupo}
              mostrarReceita={mostrarReceita}
            />
          ))}
          {mostrarTotal && (
            <CelulaDeTotal
              legenda={legendaDoTotalDaSecao}
              mostrarGrupo={mostrarGrupo}
              mostrarReceita={mostrarReceita}
              className={`py-2 font-semibold ${tom ?? ''}`}
            >
              {valor(section.totalCents)}
            </CelulaDeTotal>
          )}
          {extras.includes('average') && (
            <td className="px-3 py-2 text-right font-medium tabular-nums">
              {valor(Math.round(section.totalCents / Math.max(periods.length, 1)))}
            </td>
          )}
        </tr>

        {section.rows.map((row) => (
          <Linha
            key={row.categoryId ?? `${titulo}-sem-categoria`}
            row={row}
            periods={periods}
            subirEhBom={subirEhBom}
            aberta={open.has(row.categoryId ?? '')}
            onToggle={() => row.categoryId && toggle(row.categoryId)}
            extras={extras}
            mostrarTotal={mostrarTotal}
            grupoValores={section.values}
            receitaValores={sections.income?.values ?? []}
            grupoTotal={section.totalCents}
            receitaTotal={receitaTotal}
            onAbrir={(categoryId, nome, index) => abrirDetalhe(categoryId, nome, index, type)}
          />
        ))}
      </>
    )
  }

  const abrirDetalhe = (
    categoryId: string | null,
    nome: string,
    index: number,
    type: TransactionType,
  ) => {
    const period = periods[index]
    if (!period) return
    setDetalhe({
      categoryId,
      name: nome,
      periodLabel: periodLabel(period, data?.interval ?? interval),
      from: `${period.start}-01`,
      to: fimDoPeriodo(period),
      type,
      basis,
    })
  }

  if (isError) return <p className="text-destructive text-sm">Não foi possível carregar.</p>

  return (
    <>
      <MonthlyToolbar
        interval={interval}
        onIntervalChange={changeInterval}
        start={start}
        onStartChange={(next) => setStart(alignStart(next, interval))}
        count={count}
        onCountChange={changeCount}
        show={show}
        onShowChange={setShow}
        sort={sort}
        onSortChange={setSort}
        basis={basis}
        onBasisChange={setBasis}
        extras={extras}
        onToggleExtra={toggleExtra}
        allOpen={allOpen}
        onToggleAll={toggleAll}
        canToggleAll={expansiveis.length > 0}
      />

      {isPending && !data ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : vazio ? (
        <EmptyState
          icon={Table}
          title="Nenhum lançamento no período"
          text="Escolha outro intervalo, ou lance algo para a tabela ganhar vida."
        />
      ) : (
        <div
          ref={table.ref}
          onPointerDown={table.dragProps.onPointerDown}
          onPointerMove={table.dragProps.onPointerMove}
          onPointerUp={table.dragProps.onPointerUp}
          onPointerCancel={table.dragProps.onPointerCancel}
          className={`overflow-x-auto rounded-xl border bg-card ${table.dragProps.className} ${
            isPending ? 'opacity-60' : ''
          }`}
        >
          <table className="w-max min-w-full text-sm">
            <thead>
              {/* Cursor de seta: o cabeçalho é rótulo, não texto para selecionar */}
              <tr className="cursor-default text-muted-foreground text-xs">
                <th className={`${fixa} px-3 py-2 text-left font-normal`}>Categoria</th>
                {periods.map((period) => (
                  <th
                    key={period.start}
                    className={`min-w-32 px-3 py-2 text-right font-normal ${
                      period.start <= now && now <= period.end ? 'text-foreground' : ''
                    }`}
                  >
                    <TituloDaColuna mostrarGrupo={mostrarGrupo} mostrarReceita={mostrarReceita}>
                      <span className="first-letter:uppercase">
                        {periodLabel(period, data?.interval ?? interval)}
                      </span>
                    </TituloDaColuna>
                  </th>
                ))}
                {mostrarTotal && (
                  <th className="min-w-28 px-3 py-2 text-right font-normal">
                    <TituloDaColuna mostrarGrupo={mostrarGrupo} mostrarReceita={mostrarReceita}>
                      Total
                    </TituloDaColuna>
                  </th>
                )}
                {extras.includes('average') && (
                  <th className="min-w-24 px-3 py-2 text-right font-normal">
                    {extraLabels.average}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {show !== 'expense' &&
                secao(
                  'Entradas',
                  sections.income,
                  true,
                  'text-emerald-600 dark:text-emerald-400',
                  'income',
                )}
              {show !== 'income' && secao('Saídas', sections.expense, false, undefined, 'expense')}

              {show === 'all' && (
                <>
                  <tr className="border-t-2">
                    <th scope="row" className={`${fixa} px-3 py-2 text-left font-medium`}>
                      Saldo do período
                    </th>
                    {periods.map((period, index) => (
                      <Celula
                        key={period.start}
                        valores={saldos}
                        indice={index}
                        subirEhBom
                        forte
                        mostrarGrupo={mostrarGrupo}
                        mostrarReceita={mostrarReceita}
                      />
                    ))}
                    {mostrarTotal && (
                      <CelulaDeTotal
                        mostrarGrupo={mostrarGrupo}
                        mostrarReceita={mostrarReceita}
                        className="py-2 font-semibold"
                      >
                        {valor(acumulado)}
                      </CelulaDeTotal>
                    )}
                    {extras.includes('average') && (
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {valor(Math.round(acumulado / Math.max(periods.length, 1)))}
                      </td>
                    )}
                  </tr>
                  <tr className="border-t text-muted-foreground">
                    <th scope="row" className={`${fixa} px-3 py-2 text-left font-normal`}>
                      Acumulado
                    </th>
                    {periods.map((period, index) => (
                      <td key={period.start} className="px-3 py-2 text-right tabular-nums">
                        <span className={(acumulados[index] ?? 0) < 0 ? 'text-destructive' : ''}>
                          {valor(acumulados[index] ?? 0)}
                        </span>
                      </td>
                    ))}
                    {mostrarTotal && (
                      <CelulaDeTotal
                        mostrarGrupo={mostrarGrupo}
                        mostrarReceita={mostrarReceita}
                        className="py-2"
                      >
                        {''}
                      </CelulaDeTotal>
                    )}
                    {extras.includes('average') && <td className="px-3 py-2" />}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      <MonthlyDetailDialog
        target={detalhe}
        onOpenChange={(aberto) => {
          if (!aberto) setDetalhe(null)
        }}
      />
    </>
  )
}

type LinhaProps = {
  row: MonthlyRow
  periods: MonthlyPeriod[]
  subirEhBom: boolean
  aberta: boolean
  onToggle: () => void
  extras: MonthlyExtra[]
  mostrarTotal: boolean
  /** A seção: base do "% do grupo" das principais, período a período e no total */
  grupoValores: number[]
  grupoTotal: number
  receitaValores: number[]
  receitaTotal: number
  onAbrir: (categoryId: string | null, nome: string, index: number) => void
}

function Linha({
  row,
  periods,
  subirEhBom,
  aberta,
  onToggle,
  extras,
  mostrarTotal,
  grupoValores,
  grupoTotal,
  receitaValores,
  receitaTotal,
  onAbrir,
}: LinhaProps) {
  const temFilhas = row.children.length > 0
  const mostrarGrupo = extras.includes('shareOfGroup')
  const mostrarReceita = extras.includes('shareOfIncome')
  const legendas = legendasDe(row.values, grupoValores, receitaValores, extras)
  const legendaDoTotal = legendasDe([row.totalCents], [grupoTotal], [receitaTotal], extras)[0]
  return (
    <>
      <tr className="border-t">
        <th scope="row" className={`${fixa} px-3 py-2 text-left font-normal`}>
          <span className="flex items-center gap-2">
            {temFilhas ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={aberta}
                aria-label={`${aberta ? 'Fechar' : 'Abrir'} as subcategorias de ${row.name}`}
                className="-ml-1 rounded p-0.5 text-muted-foreground hover:bg-muted"
              >
                <ChevronRight
                  className={`size-3.5 transition-transform ${aberta ? 'rotate-90' : ''}`}
                />
              </button>
            ) : (
              <span className="w-4" />
            )}
            {row.icon && row.color ? (
              <CategoryBadge icon={row.icon} color={row.color} size="xs" />
            ) : (
              <span className="size-5" />
            )}
            <span className="truncate">{row.name}</span>
          </span>
        </th>
        {periods.map((period, index) => (
          <Celula
            key={period.start}
            valores={row.values}
            indice={index}
            subirEhBom={subirEhBom}
            onAbrir={() => onAbrir(row.categoryId, row.name, index)}
            aria={`Ver os lançamentos de ${row.name}`}
            legenda={legendas[index]}
            mostrarGrupo={mostrarGrupo}
            mostrarReceita={mostrarReceita}
          />
        ))}
        {mostrarTotal && (
          <CelulaDeTotal
            legenda={legendaDoTotal}
            mostrarGrupo={mostrarGrupo}
            mostrarReceita={mostrarReceita}
            className="py-2 font-medium"
          >
            {valor(row.totalCents)}
          </CelulaDeTotal>
        )}
        {extras.includes('average') && (
          <td className="px-3 py-2 text-right tabular-nums">
            {valor(Math.round(row.totalCents / Math.max(periods.length, 1)))}
          </td>
        )}
      </tr>

      {aberta &&
        row.children.map((child) => {
          const legendasDaFilha = legendasDe(child.values, row.values, receitaValores, extras)
          const legendaDoTotalDaFilha = legendasDe(
            [child.totalCents],
            [row.totalCents],
            [receitaTotal],
            extras,
          )[0]
          return (
            <tr key={child.categoryId} className="border-t text-muted-foreground">
              <th scope="row" className={`${fixa} py-1.5 pr-3 pl-14 text-left font-normal text-xs`}>
                {child.name}
              </th>
              {periods.map((period, index) => (
                <Celula
                  key={period.start}
                  valores={child.values}
                  indice={index}
                  subirEhBom={subirEhBom}
                  onAbrir={() => onAbrir(child.categoryId, child.name, index)}
                  aria={`Ver os lançamentos de ${child.name}`}
                  miuda
                  legenda={legendasDaFilha[index]}
                  mostrarGrupo={mostrarGrupo}
                  mostrarReceita={mostrarReceita}
                />
              ))}
              {mostrarTotal && (
                <CelulaDeTotal
                  legenda={legendaDoTotalDaFilha}
                  mostrarGrupo={mostrarGrupo}
                  mostrarReceita={mostrarReceita}
                  className="py-1.5 text-xs"
                >
                  {valor(child.totalCents)}
                </CelulaDeTotal>
              )}
              {extras.includes('average') && (
                <td className="px-3 py-1.5 text-right text-xs tabular-nums">
                  {valor(Math.round(child.totalCents / Math.max(periods.length, 1)))}
                </td>
              )}
            </tr>
          )
        })}
    </>
  )
}
