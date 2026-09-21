import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currentMonth, monthLabel, shiftMonth } from '@/lib/dates'

type MonthNavProps = {
  month: string
  onChange: (month: string) => void
  /** Texto antes do mês: "Fatura de" → "Fatura de outubro de 2026" */
  prefix?: string
  /** Para onde "Hoje" volta (padrão: o mês atual; na fatura, a fatura aberta) */
  home?: string
}

/** Setas para andar pelos meses. "Hoje" só aparece quando você saiu do mês de referência. */
export function MonthNav({ month, onChange, prefix, home = currentMonth() }: MonthNavProps) {
  const label = prefix ? `${prefix} ${monthLabel(month)}` : monthLabel(month)
  const isCurrent = month === home

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Mês anterior"
        onClick={() => onChange(shiftMonth(month, -1))}
        className="text-muted-foreground"
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-40 text-center font-medium text-sm first-letter:uppercase">
        {label}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Próximo mês"
        onClick={() => onChange(shiftMonth(month, 1))}
        className="text-muted-foreground"
      >
        <ChevronRight />
      </Button>
      {!isCurrent && (
        <Button variant="ghost" size="sm" onClick={() => onChange(home)}>
          Hoje
        </Button>
      )}
    </div>
  )
}
