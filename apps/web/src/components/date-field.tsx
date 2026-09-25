import { CalendarDays, X } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { dateLabel, toISODate } from '@/lib/dates'

// Carregado só quando alguém abre uma data: o calendário pesa mais que o resto do formulário
const CalendarPt = lazy(() => import('@/components/calendar-pt'))

/** "2026-09-22" → Date local (sem passar por UTC, que muda o dia) */
function toDate(value: string | null) {
  if (!value) return undefined
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

const formatoLongo = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
})

type DateFieldProps = {
  /** Data no formato "2026-09-22", ou nulo quando o campo pode ficar vazio */
  value: string | null
  onChange: (value: string | null) => void
  label: string
  id?: string
  /** Deixa escolher "sem data" (ex.: uma conta que ainda não foi paga) */
  clearable?: boolean
  placeholder?: string
  invalid?: boolean
}

/**
 * Campo de data: botão com a data por extenso que abre o calendário do shadcn.
 * Substitui o `<input type="date">` do navegador, que traz a caixa e o ícone dele
 * e destoa dos outros campos.
 */
export function DateField({
  value,
  onChange,
  label,
  id,
  clearable,
  placeholder = 'Escolher data',
  invalid,
}: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = toDate(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        aria-label={`${label}: ${selected ? formatoLongo.format(selected) : 'sem data'}`}
        aria-invalid={invalid}
        render={
          <Button
            variant="outline"
            className="w-full justify-start gap-2 font-normal aria-invalid:border-destructive"
          />
        }
      >
        <CalendarDays className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={`truncate ${selected ? '' : 'text-muted-foreground'}`}>
          {value ? dateLabel(value) : placeholder}
        </span>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={4} className="w-auto p-0">
        <Suspense fallback={<div className="h-72 w-64 animate-pulse rounded-md bg-muted/40" />}>
          <CalendarPt
            mode="single"
            autoFocus
            selected={selected}
            defaultMonth={selected}
            onSelect={(date) => {
              if (!date) return
              onChange(toISODate(date))
              setOpen(false)
            }}
          />
        </Suspense>
        {clearable && value && (
          <div className="border-t p-1">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground"
              onClick={() => {
                onChange(null)
                setOpen(false)
              }}
            >
              <X />
              Sem data
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
