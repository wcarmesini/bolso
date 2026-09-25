import { formatMonth, parseMonth } from '@bolso/shared'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { currentMonth, monthLabel, monthShortName } from '@/lib/dates'

/** O que se escolhe: um mês, um trimestre ou um ano inteiro */
export type PickerGranularity = 'month' | 'quarter' | 'year'

type MonthPickerProps = {
  /** Sempre guardado como mês ("2026-10"); no trimestre e no ano, o mês em que começa */
  value: string
  onChange: (month: string) => void
  label?: string
  granularity?: PickerGranularity
  /** Sem borda, para barras onde vários controles ficam lado a lado */
  discreto?: boolean
}

const trimestre = (month: number) => Math.floor((month - 1) / 3) + 1

/** Como o valor escolhido aparece no botão */
export function pickerLabel(value: string, granularity: PickerGranularity) {
  const { year, month } = parseMonth(value)
  if (granularity === 'year') return String(year)
  if (granularity === 'quarter') return `${trimestre(month)}º trimestre de ${year}`
  return monthLabel(value)
}

/**
 * Escolhe quando um período começa. O que aparece dentro depende do intervalo: doze meses,
 * quatro trimestres ou uma grade de anos — não faz sentido pedir "outubro" para quem está
 * olhando o relatório ano a ano.
 */
export function MonthPicker({
  value,
  onChange,
  label = 'Início',
  granularity = 'month',
  discreto = false,
}: MonthPickerProps) {
  const [open, setOpen] = useState(false)
  const [year, setYear] = useState(() => parseMonth(value).year)
  const selected = parseMonth(value)
  const now = parseMonth(currentMonth())

  // Reabrir sempre começa no ano do que está escolhido
  useEffect(() => {
    if (open) setYear(parseMonth(value).year)
  }, [open, value])

  const escolher = (month: string) => {
    onChange(month)
    setOpen(false)
  }

  const passo = granularity === 'year' ? 12 : 1

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={`${label}: ${pickerLabel(value, granularity)}`}
        render={
          <Button
            variant={discreto ? 'ghost' : 'outline'}
            size="sm"
            className="gap-2 font-normal text-foreground"
          />
        }
      >
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <span className="first-letter:uppercase">{pickerLabel(value, granularity)}</span>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-60 p-2">
        <div className="mb-1 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={granularity === 'year' ? 'Anos anteriores' : 'Ano anterior'}
            onClick={() => setYear(year - passo)}
            className="text-muted-foreground"
          >
            <ChevronLeft />
          </Button>
          <span className="font-medium text-sm tabular-nums">
            {granularity === 'year' ? `${year} – ${year + 11}` : year}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={granularity === 'year' ? 'Próximos anos' : 'Próximo ano'}
            onClick={() => setYear(year + passo)}
            className="text-muted-foreground"
          >
            <ChevronRight />
          </Button>
        </div>

        {granularity === 'month' && (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, index) => {
              const month = formatMonth(year, index + 1)
              const escolhido = year === selected.year && index + 1 === selected.month
              const atual = year === now.year && index + 1 === now.month
              return (
                <Button
                  key={month}
                  variant={escolhido ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => escolher(month)}
                  className={`justify-center capitalize ${
                    !escolhido && atual ? 'text-foreground ring-1 ring-border' : ''
                  }`}
                >
                  {monthShortName(month)}
                </Button>
              )
            })}
          </div>
        )}

        {granularity === 'quarter' && (
          <div className="grid grid-cols-2 gap-1">
            {[1, 2, 3, 4].map((numero) => {
              const month = formatMonth(year, (numero - 1) * 3 + 1)
              const escolhido = year === selected.year && numero === trimestre(selected.month)
              const atual = year === now.year && numero === trimestre(now.month)
              return (
                <Button
                  key={numero}
                  variant={escolhido ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => escolher(month)}
                  className={`justify-center ${
                    !escolhido && atual ? 'text-foreground ring-1 ring-border' : ''
                  }`}
                >
                  {numero}º tri
                </Button>
              )
            })}
          </div>
        )}

        {granularity === 'year' && (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 12 }, (_, index) => {
              const ano = year + index
              const escolhido = ano === selected.year
              return (
                <Button
                  key={ano}
                  variant={escolhido ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => escolher(formatMonth(ano, 1))}
                  className={`justify-center tabular-nums ${
                    !escolhido && ano === now.year ? 'text-foreground ring-1 ring-border' : ''
                  }`}
                >
                  {ano}
                </Button>
              )
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
