import { type IntegrationKey, maskSecret, providerName } from '@bolso/shared'
import { KeyRound, Plus } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { RowActions } from '@/components/row-actions'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { BankConnections } from '@/features/bank/components/bank-connections'
import { usePodeEditar } from '@/lib/access'
import { useDeleteIntegrationKey, useIntegrationKeys } from '../queries'
import { IntegrationKeyDialog } from './integration-key-dialog'

/**
 * Integrações: serviços de fora que o Bolso usa.
 *
 * São duas camadas. Em cima, o banco conectado — que é o que a pessoa quer de fato. Embaixo,
 * as chaves que fazem isso funcionar: elas ficam criptografadas no servidor e nunca voltam
 * inteiras para o navegador. (As chaves *do Bolso*, para outros programas nos chamarem,
 * ficam em Ajustes → Chaves de API: é o caminho contrário.)
 */
export function IntegrationsSettings() {
  const podeEditar = usePodeEditar()
  const { data: keys = [], isPending, isError } = useIntegrationKeys()
  const deleteKey = useDeleteIntegrationKey()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState<IntegrationKey | null>(null)

  return (
    <>
      <SectionHeader
        title="Integrações"
        description="Serviços de fora que o Bolso usa: banco (Open Finance) e inteligência artificial."
      />

      <BankConnections />

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="min-w-0">
          <h3 className="text-sm">Chaves dos serviços</h3>
          <p className="text-muted-foreground text-xs">
            Ficam criptografadas no servidor e nunca voltam inteiras para o navegador.
          </p>
        </div>
        {podeEditar && (
          <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)}>
            <Plus />
            Adicionar chave
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar as chaves.</p>
      ) : keys.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="Nenhuma chave"
          text="Adicione a chave do Pluggy para conectar o seu banco."
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
