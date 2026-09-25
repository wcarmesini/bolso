import {
  type MonthlyInterval,
  monthlyIntervals,
  type ReportBasis,
  reportBases,
  reportBasisHints,
  reportBasisLabels,
} from '@bolso/shared'
import { ChevronsDownUp, ChevronsUpDown, SlidersHorizontal } from 'lucide-react'
import { MonthPicker } from '@/components/month-picker'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type MonthlyShow = 'all' | 'expense' | 'income'
export type MonthlySort = 'total' | 'name' | 'structure'

/** Colunas e percentuais que a pessoa liga e desliga (a de cada período está sempre lá) */
export const extraColumns = ['total', 'average', 'shareOfGroup', 'shareOfIncome'] as const
export type MonthlyExtra = (typeof extraColumns)[number]

export const extraLabels: Record<MonthlyExtra, string> = {
  total: 'Total',
  average: 'Média',
  shareOfGroup: '% do grupo',
  shareOfIncome: '% da receita',
}

const extraHints: Record<MonthlyExtra, string> = {
  total: 'Soma de todos os períodos mostrados',
  average: 'Média por período',
  shareOfGroup: 'Quanto a linha pesa dentro do grupo dela',
  shareOfIncome: 'Quanto a linha consome do que entrou',
}

// De 1 a 13 colunas em qualquer intervalo: 13 meses deixa comparar com o mesmo mês do ano passado
export const CONTAGENS = Array.from({ length: 13 }, (_, index) => index + 1)

export const intervalOptions: Record<
  MonthlyInterval,
  {
    label: string
    unit: [singular: string, plural: string]
    counts: number[]
    defaultCount: number
  }
> = {
  month: { label: 'Mensal', unit: ['mês', 'meses'], counts: CONTAGENS, defaultCount: 12 },
  quarter: {
    label: 'Trimestral',
    unit: ['trimestre', 'trimestres'],
    counts: CONTAGENS,
    defaultCount: 8,
  },
  year: { label: 'Anual', unit: ['ano', 'anos'], counts: CONTAGENS, defaultCount: 5 },
}

export const countLabel = (interval: MonthlyInterval, count: number) => {
  const [singular, plural] = intervalOptions[interval].unit
  return `${count} ${count === 1 ? singular : plural}`
}

type MonthlyToolbarProps = {
  interval: MonthlyInterval
  onIntervalChange: (interval: MonthlyInterval) => void
  start: string
  onStartChange: (start: string) => void
  count: number
  onCountChange: (count: number) => void
  show: MonthlyShow
  onShowChange: (show: MonthlyShow) => void
  sort: MonthlySort
  onSortChange: (sort: MonthlySort) => void
  basis: ReportBasis
  onBasisChange: (basis: ReportBasis) => void
  extras: MonthlyExtra[]
  onToggleExtra: (extra: MonthlyExtra) => void
  allOpen: boolean
  onToggleAll: () => void
  canToggleAll: boolean
}

/*
 * Os controles do recorte ficam numa peça só, sem rótulo escrito na frente de cada um:
 * "Mensal", "Competência" e "12 meses" já dizem o que são. O nome de cada controle vive no
 * aria-label e na dica do mouse, para quem precisa — a tela fica com menos ruído.
 */
const gatilhoDiscreto =
  'border-0 bg-transparent px-2 text-foreground shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted'

const Divisor = () => <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

/** Intervalo, mês inicial, quantidade de colunas, filtros e abrir/fechar tudo */
export function MonthlyToolbar({
  interval,
  onIntervalChange,
  start,
  onStartChange,
  count,
  onCountChange,
  show,
  onShowChange,
  sort,
  onSortChange,
  basis,
  onBasisChange,
  extras,
  onToggleExtra,
  allOpen,
  onToggleAll,
  canToggleAll,
}: MonthlyToolbarProps) {
  const intervalItems = monthlyIntervals.map((value) => ({
    value,
    label: intervalOptions[value].label,
  }))
  const basisItems = reportBases.map((value) => ({
    value,
    label: reportBasisLabels[value],
  }))
  const countItems = intervalOptions[interval].counts.map((value) => ({
    value: String(value),
    label: countLabel(interval, value),
  }))

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg border bg-card p-0.5">
        <Select
          items={intervalItems}
          value={interval}
          onValueChange={(next) => onIntervalChange(next as MonthlyInterval)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Intervalo"
            title="Intervalo de cada coluna"
            className={gatilhoDiscreto}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {intervalItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Divisor />

        <Select
          items={basisItems}
          value={basis}
          onValueChange={(next) => onBasisChange(next as ReportBasis)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Regime"
            title={`Regime: ${reportBasisHints[basis].toLowerCase()}`}
            className={gatilhoDiscreto}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {basisItems.map((item) => (
              <SelectItem key={item.value} value={item.value} title={reportBasisHints[item.value]}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Divisor />

        <MonthPicker
          label="Início"
          value={start}
          onChange={onStartChange}
          granularity={interval}
          discreto
        />

        <Divisor />

        <Select
          items={countItems}
          value={String(count)}
          onValueChange={(next) => onCountChange(Number(next))}
        >
          <SelectTrigger
            size="sm"
            aria-label="Período"
            title="Quantas colunas mostrar"
            className={gatilhoDiscreto}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {countItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {canToggleAll && (
          <Button variant="ghost" size="sm" onClick={onToggleAll} className="text-muted-foreground">
            {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
            {allOpen ? 'Fechar tudo' : 'Abrir tudo'}
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="sm" className="text-muted-foreground" />}
          >
            <SlidersHorizontal />
            Opções
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            {/* O título fica dentro do grupo: fora dele, o Base UI não encontra o contexto */}
            <DropdownMenuRadioGroup
              value={show}
              onValueChange={(next) => onShowChange(next as MonthlyShow)}
            >
              <DropdownMenuLabel>Mostrar</DropdownMenuLabel>
              <DropdownMenuRadioItem value="all">Entradas e saídas</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="expense">Só saídas</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="income">Só entradas</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(next) => onSortChange(next as MonthlySort)}
            >
              <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
              <DropdownMenuRadioItem value="total">Maior total</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="name">Nome</DropdownMenuRadioItem>
              <DropdownMenuRadioItem
                value="structure"
                title="A ordem que você montou arrastando em Ajustes → Categorias"
              >
                Estrutura das categorias
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>Colunas</DropdownMenuLabel>
              {extraColumns.map((extra) => (
                <DropdownMenuCheckboxItem
                  key={extra}
                  checked={extras.includes(extra)}
                  onCheckedChange={() => onToggleExtra(extra)}
                  closeOnClick={false}
                  title={extraHints[extra]}
                >
                  {extraLabels[extra]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
