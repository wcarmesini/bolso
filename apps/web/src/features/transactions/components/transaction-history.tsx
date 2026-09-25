import { type AuditEntry, type AuditField, auditActionLabels, auditFieldLabel } from '@bolso/shared'
import { History } from 'lucide-react'
import { useState } from 'react'
import { useAccounts } from '@/features/accounts/queries'
import { useContacts } from '@/features/contacts/queries'
import { shortDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'
import { useTransactionHistory } from '../queries'

/*
 * O rastro de um lançamento, dentro do próprio formulário.
 *
 * Num orçamento de duas pessoas, "quem mudou isso?" é pergunta de todo dia — e perguntar por
 * mensagem é pior do que abrir e ver. Fica fechado por padrão: quem só quer editar não é
 * obrigado a olhar, e a consulta nem sai do navegador antes de alguém pedir.
 */

const quando = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })

type TransactionHistoryProps = { transactionId: string }

export function TransactionHistory({ transactionId }: TransactionHistoryProps) {
  const [aberto, setAberto] = useState(false)
  const { data: entradas = [], isPending } = useTransactionHistory(aberto ? transactionId : null)
  const { data: accounts = [] } = useAccounts()
  const { data: contacts = [] } = useContacts()

  /** Traduz o valor cru do banco para o que a pessoa vê na tela */
  const comoTexto = (mudanca: AuditField, valor: unknown) => {
    if (valor === null || valor === undefined || valor === '') return 'vazio'
    if (mudanca.field === 'amountCents') return formatCents(Number(valor))
    if (mudanca.field === 'accountId') {
      return accounts.find((conta) => conta.id === valor)?.name ?? 'outra conta'
    }
    if (mudanca.field === 'contactId') {
      return contacts.find((contato) => contato.id === valor)?.name ?? 'outro contato'
    }
    if (mudanca.field.endsWith('Date')) return shortDate(String(valor))
    if (mudanca.field === 'type') return valor === 'income' ? 'entrada' : 'saída'
    return String(valor)
  }

  const linhaDe = (entrada: AuditEntry) => {
    const acao = auditActionLabels[entrada.action]
    if (entrada.action !== 'update' || entrada.changes.length === 0) return acao
    const partes = entrada.changes.map(
      (mudanca) =>
        `${auditFieldLabel(mudanca.field)}: ${comoTexto(mudanca, mudanca.from)} → ${comoTexto(mudanca, mudanca.to)}`,
    )
    return `${acao} ${partes.join(' · ')}`
  }

  return (
    <div className="border-t pt-3">
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        className="flex items-center gap-1.5 text-muted-foreground text-xs hover:text-foreground"
      >
        <History className="size-3.5" />
        {aberto ? 'Esconder o histórico' : 'Ver o histórico'}
      </button>

      {aberto &&
        (isPending ? (
          <p className="mt-2 text-muted-foreground text-xs">Carregando…</p>
        ) : entradas.length === 0 ? (
          <p className="mt-2 text-muted-foreground text-xs">
            Nada registrado ainda — este lançamento é anterior ao histórico.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {entradas.map((entrada) => (
              <li key={entrada.id} className="text-xs leading-snug">
                <span className="text-foreground">{entrada.actorName.split(' ')[0]}</span>{' '}
                <span className="text-muted-foreground">
                  {linhaDe(entrada)} · {quando(entrada.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  )
}
