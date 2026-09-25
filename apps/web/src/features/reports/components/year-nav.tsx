import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { currentMonth } from '@/lib/dates'

export const thisYear = () => Number(currentMonth().slice(0, 4))

/** Setas para andar pelos anos. "Este ano" só aparece quando você saiu dele. */
export function YearNav({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Ano anterior"
        onClick={() => onChange(year - 1)}
        className="text-muted-foreground"
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-16 text-center font-medium text-sm tabular-nums">{year}</span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Próximo ano"
        onClick={() => onChange(year + 1)}
        className="text-muted-foreground"
      >
        <ChevronRight />
      </Button>
      {year !== thisYear() && (
        <Button variant="ghost" size="sm" onClick={() => onChange(thisYear())}>
          Este ano
        </Button>
      )}
    </div>
  )
}
