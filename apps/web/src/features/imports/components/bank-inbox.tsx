import { bankStatusLabel, type ImportDecision, isBankReady } from '@bolso/shared'
import { Link } from '@tanstack/react-router'
import { Inbox, Landmark, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import {
  useApproveBankPending,
  useBank,
  useBankPending,
  useSyncBankConnection,
} from '@/features/bank/queries'
import { errorMessage } from '@/lib/errors'
import { ReviewPanel, textosDoBanco } from './review-panel'

/** "1 aprovado", "4 aprovados" — o singular escapa quando a frase é montada por pedaços */
const plural = (quantos: number, um: string, varios: string) =>
  `${quantos} ${quantos === 1 ? um : varios}`

const quando = (iso: string | null) => {
  if (!iso) return 'ainda não buscou'
  const minutos = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutos < 2) return 'atualizado agora'
  if (minutos < 60) return `atualizado há ${minutos} min`
  if (minutos < 60 * 24) return `atualizado há ${Math.round(minutos / 60)} h`
  return `atualizado há ${Math.round(minutos / 60 / 24)} dias`
}

/**
 * A caixa de entrada do banco conectado.
 *
 * O Bolso busca sozinho e guarda aqui. Nada entra no orçamento sem alguém dizer que pode —
 * é a mesma conferência do extrato, mas sem ninguém ter de baixar arquivo nenhum.
 */
export function BankInbox() {
  const { data, isPending: carregandoBanco } = useBank()
  const [conexaoId, setConexaoId] = useState<string | null>(null)
  const sincronizar = useSyncBankConnection()
  const aprovar = useApproveBankPending()

  const conexoes = data?.connections ?? []

  // Começa pela conexão que tem mais coisa esperando; é onde a pessoa quer olhar primeiro
  useEffect(() => {
    if (conexoes.length === 0) return
    setConexaoId((atual) => {
      if (atual && conexoes.some((conexao) => conexao.id === atual)) return atual
      const maisCheia = [...conexoes].sort((a, b) => b.pendingCount - a.pendingCount)[0]
      return maisCheia?.id ?? null
    })
  }, [conexoes])

  const conexao = conexoes.find((item) => item.id === conexaoId) ?? null
  const { data: preview, isPending: carregandoFila } = useBankPending(conexaoId)

  const atualizar = async () => {
    if (!conexao) return
    try {
      await sincronizar.mutateAsync(conexao.id)
      toast.success('Busca concluída')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível buscar no banco.'))
    }
  }

  const confirmar = async (decisions: ImportDecision[]) => {
    if (!conexao) return
    try {
      const resultado = await aprovar.mutateAsync({ id: conexao.id, decisions })
      toast.success(
        [
          resultado.created > 0 && plural(resultado.created, 'aprovado', 'aprovados'),
          resultado.transferred > 0 &&
            plural(resultado.transferred, 'transferência', 'transferências'),
          resultado.linked > 0 && plural(resultado.linked, 'conciliado', 'conciliados'),
          resultado.skipped > 0 && plural(resultado.skipped, 'dispensado', 'dispensados'),
        ]
          .filter(Boolean)
          .join(' · ') || 'Nada a fazer',
      )
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível aprovar.'))
    }
  }

  if (carregandoBanco) return <p className="text-muted-foreground text-sm">Carregando…</p>

  if (conexoes.length === 0) {
    return (
      <EmptyState
        icon={Landmark}
        title="Nenhum banco conectado"
        text="Conecte o seu banco e o Bolso busca os lançamentos sozinho — eles ficam aqui esperando sua aprovação."
        action={
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/ajustes/integracoes" />}
          >
            Ir para Integrações
          </Button>
        }
      />
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3">
        {conexoes.length > 1 ? (
          <ToggleGroup
            variant="outline"
            spacing={0}
            size="sm"
            value={conexaoId ? [conexaoId] : []}
            onValueChange={(next) => next[0] && setConexaoId(next[0])}
          >
            {conexoes.map((item) => (
              <ToggleGroupItem key={item.id} value={item.id}>
                {item.accountName}
                {item.pendingCount > 0 && (
                  <span className="ml-1 rounded bg-primary/10 px-1 text-primary text-xs tabular-nums">
                    {item.pendingCount}
                  </span>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : (
          <p className="text-sm">
            {conexao?.connectorName}
            <span className="text-muted-foreground"> → {conexao?.accountName}</span>
          </p>
        )}

        <div className="flex items-center gap-3">
          <p className="text-muted-foreground text-xs">
            {conexao && !isBankReady(conexao.status)
              ? bankStatusLabel(conexao.status)
              : quando(conexao?.lastSyncedAt ?? null)}
          </p>
          <Button variant="outline" size="sm" onClick={atualizar} disabled={sincronizar.isPending}>
            <RefreshCw className={sincronizar.isPending ? 'animate-spin' : undefined} />
            {sincronizar.isPending ? 'Buscando…' : 'Atualizar agora'}
          </Button>
        </div>
      </div>

      {carregandoFila ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : !preview || preview.rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="Nada esperando"
          text="Tudo o que o banco mandou já foi conferido. O Bolso continua buscando sozinho."
        />
      ) : (
        <ReviewPanel
          preview={preview}
          accountId={conexao?.accountId ?? ''}
          textos={textosDoBanco}
          salvando={aprovar.isPending}
          onConfirmar={confirmar}
          resumo={
            <p className="text-muted-foreground text-xs">
              {[conexao?.connectorName, conexao?.externalAccountName, conexao?.accountName]
                .filter(Boolean)
                .join(' · ')}
            </p>
          }
        />
      )}
    </>
  )
}
