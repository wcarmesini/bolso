import {
  type BankConnection,
  type BankItemInfo,
  bankStatusLabel,
  isBankWorking,
  needsAttention,
} from '@bolso/shared'
import { Link } from '@tanstack/react-router'
import {
  Building2,
  CalendarClock,
  ChevronDown,
  Inbox,
  Landmark,
  RefreshCw,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { DateField } from '@/components/date-field'
import { RowActions } from '@/components/row-actions'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { usePodeEditar } from '@/lib/access'
import { shortDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { createConnectToken, getBankItem } from '../api'
import { abrirPluggy } from '../pluggy-connect'
import {
  useBank,
  useRemoveBankConnection,
  useSyncBankConnection,
  useUpdateBankConnection,
} from '../queries'
import { LinkAccountsDialog } from './link-accounts-dialog'

const quando = (iso: string | null) => {
  if (!iso) return 'ainda não buscou'
  const data = new Date(iso)
  const minutos = Math.round((Date.now() - data.getTime()) / 60_000)
  if (minutos < 2) return 'agora há pouco'
  if (minutos < 60) return `há ${minutos} min`
  if (minutos < 60 * 24) return `há ${Math.round(minutos / 60)} h`
  return shortDate(iso.slice(0, 10))
}

/**
 * Bancos conectados.
 *
 * O Bolso busca sozinho a cada meia hora e guarda o que chega esperando aprovação. Esta tela
 * é o painel da conexão: como ela está, desde quando busca, e o caminho para conferir o que
 * está na fila.
 */
export function BankConnections() {
  const podeEditar = usePodeEditar()
  const { data, isPending } = useBank()
  const sincronizar = useSyncBankConnection()
  const remover = useRemoveBankConnection()
  const mudarInicio = useUpdateBankConnection()

  const [abrindo, setAbrindo] = useState(false)
  const [item, setItem] = useState<BankItemInfo | null>(null)
  /** Com qual chave a conexão que está nascendo vai ser buscada */
  const [chaveEmUso, setChaveEmUso] = useState<string | undefined>()
  const [removendo, setRemovendo] = useState<BankConnection | null>(null)
  const [editando, setEditando] = useState<BankConnection | null>(null)
  const [novoInicio, setNovoInicio] = useState('')

  const conexoes = data?.connections ?? []
  const chaves = data?.keys ?? []
  const esperando = conexoes.reduce((total, conexao) => total + conexao.pendingCount, 0)

  /*
   * Conectar (ou arrumar) um banco: o servidor cria o token, o widget do Pluggy faz o resto.
   * Quando ele fecha, perguntamos ao Pluggy o que aquela conexão tem dentro — o banco pode
   * ainda estar respondendo, e é isso que a tela de ligar as contas mostra.
   */
  const conectar = async (conexao?: BankConnection, chaveId?: string) => {
    const chave = conexao?.integrationKeyId ?? chaveId ?? chaves[0]?.id
    setChaveEmUso(chave)
    setAbrindo(true)
    try {
      const { accessToken } = await createConnectToken(conexao?.itemId, chave)
      await abrirPluggy({
        connectToken: accessToken,
        updateItem: conexao?.itemId,
        onSuccess: async ({ item: conectado }) => {
          try {
            const info = await getBankItem(conectado.id, chave)
            if (conexao) {
              toast.success('Conexão atualizada')
              await sincronizar.mutateAsync(conexao.id)
            } else {
              setItem(info)
            }
          } catch (cause) {
            toast.error(errorMessage(cause, 'Não foi possível ler as contas do banco.'))
          }
        },
        onError: () => toast.error('O banco não concluiu a conexão.'),
      })
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível abrir a conexão com o banco.'))
    } finally {
      setAbrindo(false)
    }
  }

  const atualizar = async (conexao: BankConnection) => {
    try {
      await sincronizar.mutateAsync(conexao.id)
      toast.success('Busca concluída')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível buscar no banco.'))
    }
  }

  const semChave = !isPending && !data?.configured

  // Sem chave e sem nada conectado: o caminho é cadastrar a chave, ali embaixo
  if (semChave && conexoes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-4">
        <p className="text-sm">Banco conectado (Open Finance)</p>
        <p className="mt-1 text-muted-foreground text-sm">
          Cadastre abaixo a chave do <strong>Pluggy</strong> (Client ID e Client Secret) e o botão
          para conectar o seu banco aparece aqui.
        </p>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm">Bancos conectados</h3>
          <p className="text-muted-foreground text-xs">
            O Bolso busca sozinho de tempos em tempos. O que chega fica esperando sua aprovação.
          </p>
        </div>
        {!podeEditar ? null : chaves.length > 1 ? (
          /*
           * Mais de uma chave: a conexão precisa nascer da pessoa certa. No plano pessoal da
           * Pluggy cada chave só enxerga as contas do próprio titular, então conectar o banco
           * da Débora com a chave do Wilson simplesmente não funciona.
           */
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={abrindo} />}>
              <Landmark />
              {abrindo ? 'Abrindo…' : 'Conectar banco'}
              <ChevronDown className="opacity-70" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* O título fica dentro do grupo: fora dele, o Base UI não acha o contexto */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>Com a chave de</DropdownMenuLabel>
                {chaves.map((chave) => (
                  <DropdownMenuItem key={chave.id} onClick={() => conectar(undefined, chave.id)}>
                    {chave.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => conectar()}
            disabled={abrindo || semChave}
          >
            <Landmark />
            {abrindo ? 'Abrindo…' : 'Conectar banco'}
          </Button>
        )}
      </div>

      {/* A chave saiu, mas as conexões continuam aqui: some a busca, não o que já foi ligado */}
      {semChave && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-amber-700 text-sm dark:text-amber-400">
          Sem a chave do Pluggy, o Bolso não consegue mais buscar nestes bancos. Cadastre-a de novo
          abaixo.
        </p>
      )}

      {esperando > 0 && (
        <Link
          to="/importar"
          className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-amber-700 text-sm dark:text-amber-400"
        >
          <Inbox className="size-4 shrink-0" />
          <span>
            <strong className="tabular-nums">{esperando}</strong>{' '}
            {esperando === 1 ? 'lançamento esperando' : 'lançamentos esperando'} aprovação
          </span>
        </Link>
      )}

      {conexoes.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-muted-foreground text-sm">
          Nenhum banco conectado ainda.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {conexoes.map((conexao) => (
            <li
              key={conexao.id}
              className="group/row relative flex items-center gap-3 py-2.5 pr-2 pl-4"
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
                {conexao.connectorImageUrl ? (
                  <img src={conexao.connectorImageUrl} alt="" className="size-9 object-contain" />
                ) : (
                  <Building2 className="size-4" />
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {conexao.connectorName}
                  <span className="text-muted-foreground"> → {conexao.accountName}</span>
                </span>
                <span className="block truncate text-muted-foreground text-xs">
                  {[
                    bankStatusLabel(conexao.status),
                    `desde ${shortDate(conexao.startDate)}`,
                    quando(conexao.lastSyncedAt),
                    conexao.pendingCount > 0 && `${conexao.pendingCount} esperando`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>

              {needsAttention(conexao.status) && podeEditar && (
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => conectar(conexao)}
                >
                  <Wrench />
                  Arrumar
                </Button>
              )}

              <RowActions
                itemName={conexao.connectorName}
                deleteLabel="Desconectar"
                actions={[
                  {
                    label: isBankWorking(conexao.status) ? 'Buscando…' : 'Atualizar agora',
                    icon: RefreshCw,
                    onSelect: () => void atualizar(conexao),
                  },
                  {
                    label: 'Mudar a data de início',
                    icon: CalendarClock,
                    onSelect: () => {
                      setEditando(conexao)
                      setNovoInicio(conexao.startDate)
                    },
                  },
                ]}
                onDelete={() => setRemovendo(conexao)}
              />
            </li>
          ))}
        </ul>
      )}

      <LinkAccountsDialog
        item={item}
        integrationKeyId={chaveEmUso}
        onOpenChange={(open) => !open && setItem(null)}
      />

      <Dialog open={editando !== null} onOpenChange={(open) => !open && setEditando(null)}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Buscar a partir de</DialogTitle>
              <DialogDescription>
                Nada antes desta data é trazido do banco. O que já foi aprovado continua onde está.
              </DialogDescription>
            </DialogHeader>
            <DateField
              label="Buscar a partir de"
              value={novoInicio}
              onChange={(next) => setNovoInicio(next ?? novoInicio)}
            />
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button
                onClick={async () => {
                  if (!editando) return
                  try {
                    await mudarInicio.mutateAsync({ id: editando.id, startDate: novoInicio })
                    setEditando(null)
                    toast.success('Data atualizada')
                  } catch (cause) {
                    toast.error(errorMessage(cause, 'Não foi possível mudar a data.'))
                  }
                }}
              >
                Salvar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={removendo !== null}
        onOpenChange={(open) => {
          if (!open) setRemovendo(null)
        }}
        title={`Desconectar o ${removendo?.connectorName ?? 'banco'}?`}
        description="O Bolso para de buscar nesta conta. Os lançamentos já aprovados ficam como estão; o que ainda esperava aprovação é descartado."
        confirmLabel="Desconectar"
        successMessage="Banco desconectado"
        onConfirm={async () => {
          if (removendo) await remover.mutateAsync(removendo.id)
        }}
      />
    </section>
  )
}
