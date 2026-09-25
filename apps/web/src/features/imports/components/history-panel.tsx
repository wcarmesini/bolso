import type { ImportBatch } from '@bolso/shared'
import { FileUp, History, Landmark, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { useImportHistory, useUndoImport } from '../queries'

const formatoLongo = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const quando = (iso: string) => formatoLongo.format(new Date(iso)).replace('.', '')

/** "3 aprovados · 1 conciliado · 2 dispensados", sem os zeros */
const resumo = (lote: ImportBatch) => {
  const doBanco = lote.source === 'bank'
  const pedacos: string[] = []
  const somar = (quantos: number, um: string, varios = `${um}s`) => {
    if (quantos > 0) pedacos.push(`${quantos} ${quantos === 1 ? um : varios}`)
  }
  somar(lote.created, doBanco ? 'aprovado' : 'importado')
  somar(lote.transferred, 'transferência', 'transferências')
  somar(lote.linked, 'conciliado')
  somar(lote.skipped, doBanco ? 'dispensado' : 'ignorado')
  return pedacos.join(' · ')
}

/**
 * Histórico de importações, com volta.
 *
 * Aprovar uma leva inteira sem olhar direito acontece, e sem isto o conserto seria apagar
 * lançamento por lançamento na mão. Desfazer apaga o que nasceu daquela leva, solta o que
 * foi conciliado (o lançamento fica, só perde o vínculo) e devolve tudo para a fila.
 */
export function HistoryPanel() {
  const { data: lotes = [], isPending } = useImportHistory()
  const desfazer = useUndoImport()
  const [escolhido, setEscolhido] = useState<ImportBatch | null>(null)

  if (isPending) return <p className="text-muted-foreground text-sm">Carregando…</p>

  if (lotes.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Nada importado ainda"
        text="Quando você aprovar lançamentos do banco ou importar um extrato, cada leva aparece aqui — e pode ser desfeita."
      />
    )
  }

  return (
    <>
      <ul className="divide-y rounded-xl border bg-card">
        {lotes.map((lote) => (
          <li key={lote.id} className="flex items-center gap-3 py-2.5 pr-3 pl-4">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
              {lote.source === 'bank' ? (
                <Landmark className="size-4" />
              ) : (
                <FileUp className="size-4" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {lote.label || (lote.source === 'bank' ? 'Banco' : 'Extrato')}
                <span className="text-muted-foreground"> · {lote.accountName}</span>
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {[quando(lote.createdAt), resumo(lote), lote.authorName]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>

            {lote.undoneAt ? (
              <span className="shrink-0 text-muted-foreground text-xs">desfeita</span>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground"
                onClick={() => setEscolhido(lote)}
              >
                <Undo2 />
                Desfazer
              </Button>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDeleteDialog
        open={escolhido !== null}
        onOpenChange={(open) => {
          if (!open) setEscolhido(null)
        }}
        title="Desfazer esta importação?"
        description="Os lançamentos que nasceram dela são apagados. Os que já existiam ficam, apenas soltos do banco. Tudo volta a esperar aprovação."
        confirmLabel="Desfazer"
        successMessage="Importação desfeita"
        failMessage="Não foi possível desfazer."
        onConfirm={async () => {
          if (!escolhido) return
          const volta = await desfazer.mutateAsync(escolhido.id)
          return (
            [
              volta.removed > 0 && `${volta.removed} apagados`,
              volta.unlinked > 0 && `${volta.unlinked} soltos do banco`,
              volta.restored > 0 && `${volta.restored} de volta na fila`,
              volta.missing > 0 && `${volta.missing} já não existiam`,
            ]
              .filter(Boolean)
              .join(' · ') || 'Importação desfeita'
          )
        }}
      />
    </>
  )
}
