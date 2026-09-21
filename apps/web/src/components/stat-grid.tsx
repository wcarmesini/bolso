import type { ReactNode } from 'react'

export type Stat = {
  label: string
  value: string
  /** Classe de cor do valor (ex.: 'text-destructive' quando o saldo fica negativo) */
  tone?: string
  strong?: boolean
}

/** Os números do topo de uma tela (entradas, saídas, saldo…), num cartão discreto */
export function StatGrid({ stats, children }: { stats: Stat[]; children?: ReactNode }) {
  const columns = stats.length > 3 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3">
      <dl className={`grid gap-2 ${columns}`}>
        {stats.map(({ label, value, tone, strong }) => (
          <div key={label} className="min-w-0">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd
              className={`truncate text-sm tabular-nums ${strong ? 'font-semibold' : 'font-medium'} ${tone ?? ''}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {children}
    </div>
  )
}
