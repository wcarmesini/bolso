import {
  type ApiKey,
  apiKeyScopeHints,
  apiKeyScopeLabels,
  apiKeyScopes,
  type CreatedApiKey,
} from '@bolso/shared'
import { Check, Copy, KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { RowActions } from '@/components/row-actions'
import { SectionHeader } from '@/components/section-header'
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { shortDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useApiKeys, useCreateApiKey, useDeleteApiKey } from '../queries'

const escopos = apiKeyScopes.map((scope) => ({ value: scope, label: apiKeyScopeLabels[scope] }))

/**
 * Chaves da API do Bolso.
 *
 * É o caminho contrário das Integrações: aqui o Bolso entrega uma chave para outro programa
 * — uma planilha, um robô, um assistente — chamar a nossa API no lugar da pessoa. A chave
 * aparece inteira uma vez só; depois fica guardado só o resumo dela.
 */
export function ApiKeysSettings() {
  const { data: keys = [], isPending, isError } = useApiKeys()
  const criar = useCreateApiKey()
  const apagar = useDeleteApiKey()

  const [criando, setCriando] = useState(false)
  const [nome, setNome] = useState('')
  const [scope, setScope] = useState<ApiKey['scope']>('read')
  const [nova, setNova] = useState<CreatedApiKey | null>(null)
  const [copiada, setCopiada] = useState(false)
  const [apagando, setApagando] = useState<ApiKey | null>(null)

  const gerar = async () => {
    try {
      const criada = await criar.mutateAsync({ name: nome.trim() || 'Chave', scope })
      setCriando(false)
      setNome('')
      setScope('read')
      setCopiada(false)
      setNova(criada)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível criar a chave.'))
    }
  }

  const copiar = async () => {
    if (!nova) return
    try {
      await navigator.clipboard.writeText(nova.token)
      setCopiada(true)
      toast.success('Chave copiada')
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie na mão.')
    }
  }

  return (
    <>
      <SectionHeader
        title="Chaves de API"
        description="Deixam outro programa usar a API do Bolso no seu lugar."
        action={
          <Button onClick={() => setCriando(true)}>
            <Plus />
            Criar chave
          </Button>
        }
      />

      {isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar as chaves.</p>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Nenhuma chave"
          text="Crie uma chave para conectar uma planilha, um robô ou um assistente à sua API."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {keys.map((key) => (
            <li
              key={key.id}
              className="group/row relative flex items-center gap-3 py-2.5 pr-2 pl-4"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                <KeyRound className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">
                  {key.name}
                  <span className="text-muted-foreground">
                    {' '}
                    · {apiKeyScopeLabels[key.scope].toLowerCase()}
                  </span>
                </span>
                <span className="block truncate font-mono text-muted-foreground text-xs">
                  {key.prefix}…{' '}
                  <span className="font-sans">
                    {key.lastUsedAt
                      ? `usada em ${shortDate(key.lastUsedAt.slice(0, 10))}`
                      : 'nunca usada'}
                  </span>
                </span>
              </span>
              <RowActions
                itemName={key.name}
                deleteLabel="Revogar"
                onDelete={() => setApagando(key)}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        Para usar, mande o cabeçalho <code className="font-mono">Authorization: Bearer </code>
        com a chave em cada chamada a <code className="font-mono">/api</code>.
      </p>

      <Dialog open={criando} onOpenChange={setCriando}>
        <DialogContent className="sm:max-w-sm">
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Criar chave</DialogTitle>
              <DialogDescription>
                A chave aparece uma vez só. Guarde num lugar seguro.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <Field>
                <FieldLabel htmlFor="api-key-name">Nome</FieldLabel>
                <Input
                  id="api-key-name"
                  placeholder="Ex.: Planilha de casa"
                  autoComplete="off"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="api-key-scope">Permissão</FieldLabel>
                <Select
                  items={escopos}
                  value={scope}
                  onValueChange={(next) => setScope(next as ApiKey['scope'])}
                >
                  <SelectTrigger id="api-key-scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {escopos.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{apiKeyScopeHints[scope]}</FieldDescription>
              </Field>
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
              <Button onClick={gerar} disabled={criar.isPending}>
                {criar.isPending ? 'Criando…' : 'Criar chave'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={nova !== null} onOpenChange={(open) => !open && setNova(null)}>
        <DialogContent className="sm:max-w-lg">
          <div className="flex flex-col gap-6">
            <DialogHeader>
              <DialogTitle>Sua chave</DialogTitle>
              <DialogDescription>
                Esta é a única vez que ela aparece inteira. Se perder, crie outra.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{nova?.token}</code>
              <Button variant="outline" size="sm" onClick={copiar} className="shrink-0">
                {copiada ? <Check /> : <Copy />}
                {copiada ? 'Copiada' : 'Copiar'}
              </Button>
            </div>

            <DialogFooter>
              <DialogClose render={<Button />}>Guardei</DialogClose>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={apagando !== null}
        onOpenChange={(open) => {
          if (!open) setApagando(null)
        }}
        title={`Revogar a chave ${apagando?.name ?? ''}?`}
        description="Quem estiver usando esta chave para de conseguir entrar na hora."
        confirmLabel="Revogar"
        successMessage="Chave revogada"
        onConfirm={async () => {
          if (apagando) await apagar.mutateAsync(apagando.id)
        }}
      />
    </>
  )
}
