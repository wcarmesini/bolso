import { Eye, FileUp, History, Landmark } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useBank } from '@/features/bank/queries'
import { usePodeEditar } from '@/lib/access'
import { BankInbox } from './bank-inbox'
import { HistoryPanel } from './history-panel'
import { OfxImport } from './ofx-import'

type Fonte = 'banco' | 'arquivo' | 'historico'

/**
 * Conferir o que veio de fora.
 *
 * Dois caminhos para a mesma pergunta — isto é novo, ou já está lançado? O banco conectado
 * chega sozinho e fica esperando aprovação; o extrato OFX é para quando o banco não tem
 * Open Finance, ou para trazer um histórico antigo de uma vez.
 */
export function ImportPage() {
  const podeEditar = usePodeEditar()
  const { data } = useBank()
  const esperando = (data?.connections ?? []).reduce(
    (total, conexao) => total + conexao.pendingCount,
    0,
  )
  const temBanco = (data?.connections.length ?? 0) > 0

  const [escolhida, setEscolhida] = useState<Fonte | null>(null)
  // Sem escolha ainda: vai para onde há trabalho a fazer
  const fonte = escolhida ?? (temBanco ? 'banco' : 'arquivo')

  if (!podeEditar) {
    return (
      <>
        <PageHeader title="Conferir lançamentos" />
        <PageBody>
          <EmptyState
            icon={Eye}
            title="Só quem edita confere"
            text="Aprovar o que vem do banco e importar extrato criam lançamentos. Seu acesso a este orçamento é de leitura."
          />
        </PageBody>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Conferir lançamentos" />
      <PageBody>
        <ToggleGroup
          variant="outline"
          spacing={0}
          size="sm"
          value={[fonte]}
          onValueChange={(next) => {
            const escolha = next[0]
            if (escolha === 'banco' || escolha === 'arquivo' || escolha === 'historico') {
              setEscolhida(escolha)
            }
          }}
          className="self-start"
        >
          <ToggleGroupItem value="banco">
            <Landmark />
            Do banco
            {esperando > 0 && (
              <span className="ml-1 rounded bg-primary/10 px-1 text-primary text-xs tabular-nums">
                {esperando}
              </span>
            )}
          </ToggleGroupItem>
          <ToggleGroupItem value="arquivo">
            <FileUp />
            Arquivo OFX
          </ToggleGroupItem>
          <ToggleGroupItem value="historico">
            <History />
            Histórico
          </ToggleGroupItem>
        </ToggleGroup>

        {fonte === 'banco' && <BankInbox />}
        {fonte === 'arquivo' && <OfxImport />}
        {fonte === 'historico' && <HistoryPanel />}
      </PageBody>
    </>
  )
}
