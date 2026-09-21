import { type IntegrationKey, maskSecret, providerName } from '@bolso/shared'
import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { RowActions } from '@/components/row-actions'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { useDeleteIntegrationKey, useIntegrationKeys } from '../queries'
import { IntegrationKeyDialog } from './integration-key-dialog'

// Tokens de acesso ao Bolso (para outros apps) entram aqui quando a API existir
export function ApiKeysSettings() {
  const { data: keys = [], isPending, isError } = useIntegrationKeys()
  const deleteKey = useDeleteIntegrationKey()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<IntegrationKey | null>(null)

  return (
    <>
      <SectionHeader
        title="Chaves de API"
        description="Serviços usados pelo Bolso, como Open Finance e IA."
        action={
          <Button onClick={() => setDialogOpen(true)}>
            <Plus />
            Adicionar chave
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
          text="Clique em “Adicionar chave” para conectar um serviço."
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
              <span className="min-w-0">
                <span className="block truncate text-sm">
                  {providerName(key)}
                  {key.label && <span className="text-muted-foreground"> · {key.label}</span>}
                </span>
                <span className="block font-mono text-muted-foreground text-xs">
                  {maskSecret(key)}
                </span>
              </span>
              <RowActions
                itemName={providerName(key)}
                deleteLabel="Remover"
                onDelete={() => setDeleting(key)}
              />
            </li>
          ))}
        </ul>
      )}

      <IntegrationKeyDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Remover a chave de ${deleting ? providerName(deleting) : ''}?`}
        description="O Bolso deixa de usar esta chave."
        confirmLabel="Remover"
        successMessage="Chave removida"
        onConfirm={async () => {
          if (deleting) await deleteKey.mutateAsync(deleting.id)
        }}
      />
    </>
  )
}
