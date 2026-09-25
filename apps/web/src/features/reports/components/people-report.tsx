import { Users } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { MonthNav } from '@/components/month-nav'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getInitials } from '@/lib/current-user'
import { currentMonth } from '@/lib/dates'
import { formatCents, formatShare } from '@/lib/money'
import { usePeopleReport } from '../queries'

/** Quem lançou quanto no mês (pela data da compra). Todo mundo do orçamento aparece, mesmo zerado. */
export function PeopleReport() {
  const [month, setMonth] = useState(currentMonth)
  const { data, isPending, isError } = usePeopleReport(month)

  const people = data?.people ?? []
  const total = people.reduce((sum, person) => sum + person.expenseCents, 0)
  const max = Math.max(1, ...people.map((person) => person.expenseCents))

  return (
    <>
      <MonthNav month={month} onChange={setMonth} />

      {isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar.</p>
      ) : isPending && !data ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Ninguém mais neste orçamento"
          text="Convide alguém em Ajustes → Orçamentos."
        />
      ) : (
        <div className={`flex flex-col gap-4 ${isPending ? 'opacity-60' : ''}`}>
          <p className="px-1 text-muted-foreground text-xs">
            Gastos lançados no mês:{' '}
            <span className="text-foreground tabular-nums">{formatCents(total)}</span>
            {people.length === 1 && ' · convide alguém em Ajustes → Orçamentos para dividir'}
          </p>
          <ul className="divide-y rounded-xl border bg-card">
            {people.map((person) => (
              <li key={person.userId} className="flex items-center gap-3 px-4 py-3">
                <Avatar size="sm">
                  {person.image && <AvatarImage src={person.image} alt="" />}
                  <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
                    {getInitials(person.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm">{person.name}</span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatCents(person.expenseCents)}
                      <span className="ml-1.5 text-muted-foreground text-xs">
                        {formatShare(person.expenseCents, total)}
                      </span>
                    </span>
                  </span>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground/60"
                      style={{ width: `${(person.expenseCents / max) * 100}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {person.count === 0
                      ? 'Nenhum lançamento'
                      : `${person.count} ${person.count === 1 ? 'lançamento' : 'lançamentos'}`}
                    {person.incomeCents > 0 && ` · recebeu ${formatCents(person.incomeCents)}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
