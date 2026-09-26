import { bankStatusLabel, type ImportDecision, isBankReady, shortAccountName } from '@bolso/shared'
import { Link } from '@tanstack/react-router'
import { EyeOff, Inbox, Landmark, MoreHorizontal, RefreshCw, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { DraggableRow } from '@/components/draggable-row'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  useApproveBankPending,
  useBank,
  useBankPending,
  useSaveDecisions,
  useSyncBankConnection,
} from '@/features/bank/queries'
import { errorMessage } from '@/lib/errors'
import { DismissedDialog } from './dismissed-dialog'
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
  const [vendoDispensados, setVendoDispensados] = useState(false)
  const sincronizar = useSyncBankConnection()
  const aprovar = useApproveBankPending()
  const guardar = useSaveDecisions()

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

  // Na tela estreita a fila de contas rola: a escolhida vem para o meio ao trocar
  const barraDeContas = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!conexaoId) return
    barraDeContas.current
      ?.querySelector(`[aria-pressed="true"]`)
      ?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [conexaoId])

  /** Quantas contas ficariam com o mesmo apelido depois de tirar o nome do banco */
  const nomesCurtos = useMemo(() => {
    const contagem = new Map<string, number>()
    for (const item of conexoes) {
      const curto = shortAccountName(item.connectorName, item.accountName)
      contagem.set(curto, (contagem.get(curto) ?? 0) + 1)
    }
    return contagem
  }, [conexoes])
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

  /*
   * O que já foi decidido vai para o banco a cada clique. Falhar aqui não desfaz nada na
   * tela: a pessoa continua vendo o que escolheu, e o aviso diz que o rascunho não foi
   * guardado — clicar de novo resolve.
   */
  const guardarDecisoes = (decisions: Parameters<typeof guardar.mutate>[0]['decisions']) => {
    if (!conexao) return
    guardar.mutate(
      { id: conexao.id, decisions },
      {
        onError: (cause) =>
          toast.error(errorMessage(cause, 'Não foi possível guardar a classificação.')),
      },
    )
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
      <DismissedDialog
        connectionId={conexaoId}
        open={vendoDispensados}
        onOpenChange={setVendoDispensados}
      />

      {/*
       * As contas conectadas, com o logo do banco na frente.
       * O nome do banco sai do rótulo — ele já está no logo, e repetido cinco vezes empurrava
       * para o fim justamente o que distingue uma conta da outra ("Cartão", "CC", "Poupança").
       */}
      {conexoes.length > 1 && (
        <DraggableRow refDaFila={barraDeContas}>
          {conexoes.map((item) => {
            const atual = item.id === conexaoId
            const curto = shortAccountName(item.connectorName, item.accountName)
            // Dois bancos com um "Cartão" cada: aí o nome inteiro é o que distingue
            const rotulo = nomesCurtos.get(curto) === 1 ? curto : item.accountName
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={atual}
                onClick={() => setConexaoId(item.id)}
                className={`flex w-52 shrink-0 flex-col gap-1 rounded-xl border p-3 text-left transition-colors ${
                  atual
                    ? 'border-primary/40 bg-primary/5'
                    : 'bg-card hover:border-foreground/20 hover:bg-muted/50'
                }`}
              >
                <span className="flex items-center gap-2">
                  {item.connectorImageUrl ? (
                    <img
                      src={item.connectorImageUrl}
                      alt=""
                      className="size-4 shrink-0 rounded-sm"
                    />
                  ) : (
                    <Landmark className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${atual ? '' : 'text-muted-foreground'}`}
                  >
                    {rotulo}
                  </span>
                  {item.pendingCount > 0 && (
                    <span
                      className={`shrink-0 rounded px-1 text-xs tabular-nums ${
                        atual ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {item.pendingCount}
                    </span>
                  )}
                </span>
                <span className="truncate text-muted-foreground text-xs">
                  {item.externalAccountName || item.connectorName}
                </span>
              </button>
            )
          })}
        </DraggableRow>
      )}

      {/* Que conta é esta lá no banco, quando foi buscada, e o que dá para fazer agora */}
      <div className="flex items-center gap-2">
        <p className="min-w-0 truncate text-muted-foreground text-xs">
          {[
            conexoes.length === 1 && conexao?.connectorName,
            conexoes.length === 1 && conexao?.externalAccountName,
            conexao && !isBankReady(conexao.status)
              ? bankStatusLabel(conexao.status)
              : quando(conexao?.lastSyncedAt ?? null),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Buscar no banco agora"
                  className="text-muted-foreground"
                  onClick={atualizar}
                  disabled={sincronizar.isPending}
                />
              }
            >
              <RefreshCw className={sincronizar.isPending ? 'animate-spin' : undefined} />
            </TooltipTrigger>
            <TooltipContent>
              {sincronizar.isPending ? 'Buscando no banco…' : 'Buscar no banco agora'}
            </TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Mais ações desta conta"
              render={<Button variant="ghost" size="icon-sm" className="text-muted-foreground" />}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => setVendoDispensados(true)}>
                <EyeOff />
                Ver dispensados
              </DropdownMenuItem>
              <DropdownMenuItem nativeButton={false} render={<Link to="/ajustes/integracoes" />}>
                <Settings2 />
                Bancos conectados
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
          onGuardar={guardarDecisoes}
        />
      )}
    </>
  )
}
