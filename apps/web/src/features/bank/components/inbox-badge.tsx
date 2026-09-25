import { Link } from '@tanstack/react-router'
import { Inbox } from 'lucide-react'
import { useBank } from '../queries'

/**
 * O aviso de que o banco trouxe coisa nova.
 *
 * Como a busca acontece sozinha, sem este sinal ninguém saberia que há algo esperando. Ele
 * aparece só quando há — a barra continua limpa no resto do tempo.
 */
export function InboxBadge() {
  const { data } = useBank()
  const esperando = (data?.connections ?? []).reduce(
    (total, conexao) => total + conexao.pendingCount,
    0,
  )
  if (esperando === 0) return null

  return (
    <Link
      to="/importar"
      title={`${esperando} ${esperando === 1 ? 'lançamento espera' : 'lançamentos esperam'} sua aprovação`}
      aria-label={`${esperando} esperando aprovação`}
      className="flex h-8 items-center gap-1.5 rounded-md px-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
    >
      <Inbox className="size-4" />
      <span className="rounded bg-primary/10 px-1 text-primary text-xs tabular-nums">
        {esperando}
      </span>
    </Link>
  )
}
