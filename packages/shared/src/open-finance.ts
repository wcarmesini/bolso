import { z } from 'zod'
import { nameKey } from './text'

/*
 * Conexão com o banco (Open Finance, via Pluggy).
 *
 * A diferença para o extrato OFX é de onde vêm os dados, não do que acontece com eles:
 * o Bolso busca os lançamentos sozinho, de tempos em tempos, e eles ficam **esperando
 * aprovação** na caixa de entrada. Nada entra no orçamento sem alguém dizer que pode.
 *
 * Uma conexão é uma conta do banco ligada a uma conta do Bolso, com a data a partir da qual
 * queremos os lançamentos — assim ninguém precisa conferir dois anos de histórico.
 */

/** Como o Pluggy chama o estado de uma conexão */
export const bankStatusLabels: Record<string, string> = {
  CREATING: 'Conectando…',
  UPDATING: 'Buscando no banco…',
  MERGING: 'Organizando…',
  UPDATED: 'Em dia',
  OUTDATED: 'Desatualizada',
  WAITING_USER_INPUT: 'O banco pediu uma confirmação',
  LOGIN_ERROR: 'Precisa entrar no banco de novo',
  ERROR: 'Deu problema na última busca',
}

export const bankStatusLabel = (status: string) => bankStatusLabels[status] ?? status

/** Dá para buscar lançamentos: o banco já respondeu, mesmo que a conexão esteja velha */
export const isBankReady = (status: string) => status === 'UPDATED' || status === 'OUTDATED'

/** O banco ainda está respondendo — esperar em vez de insistir */
export const isBankWorking = (status: string) =>
  status === 'CREATING' || status === 'UPDATING' || status === 'MERGING'

/** Precisa da pessoa: senha nova, token do banco, confirmação no aplicativo */
export const needsAttention = (status: string) =>
  status === 'LOGIN_ERROR' || status === 'WAITING_USER_INPUT'

/**
 * O nome da conta sem repetir o do banco.
 *
 * Quem batiza as contas costuma escrever "Banco do Brasil - Cartão", "Banco do Brasil - CC".
 * Numa fila com cinco conexões, o nome do banco aparece cinco vezes e o que distingue uma da
 * outra fica no fim. Ao lado do logo do banco, o começo é redundante: fica só "Cartão", "CC".
 */
export function shortAccountName(connectorName: string, accountName: string) {
  const banco = nameKey(connectorName)
  if (!banco || !nameKey(accountName).startsWith(banco)) return accountName
  const resto = accountName.slice(connectorName.length).replace(/^[\s\-–—·:|]+/, '')
  return resto || accountName
}

/** Uma conta do banco ligada a uma conta do Bolso */
export type BankConnection = {
  id: string
  itemId: string
  connectorName: string
  connectorImageUrl: string | null
  status: string
  /** O que o banco respondeu quando deu errado, já em português quando o Pluggy manda */
  statusMessage: string | null
  /** Conta do Bolso que recebe os lançamentos */
  accountId: string
  accountName: string
  /** De quem é a chave do Pluggy que busca esta conexão */
  integrationKeyId: string | null
  /** Conta lá no banco */
  externalAccountId: string
  externalAccountName: string
  /** Não buscar nada antes disso */
  startDate: string
  lastSyncedAt: string | null
  /** Quantos lançamentos estão esperando aprovação nesta conexão */
  pendingCount: number
  createdAt: string
}

/** Uma conta que o banco devolveu, ainda sem ligação com o Bolso */
export type BankAccountOption = {
  id: string
  name: string
  number: string | null
  type: string
  balanceCents: number
  /** Já existe uma conexão para esta conta do banco */
  linked: boolean
}

/** O que a tela precisa saber logo depois do widget fechar */
export type BankItemInfo = {
  itemId: string
  status: string
  statusMessage: string | null
  connectorName: string
  connectorImageUrl: string | null
  accounts: BankAccountOption[]
}

export const bankLinkSchema = z.object({
  itemId: z.string().min(1, 'Conexão não informada').max(80),
  /** Com qual chave do Pluggy esta conexão nasceu (um casal costuma ter uma de cada) */
  integrationKeyId: z.uuid().optional(),
  links: z
    .array(
      z.object({
        externalAccountId: z.string().min(1).max(80),
        accountId: z.uuid('Escolha a conta do Bolso'),
        startDate: z.iso.date('Data inválida'),
      }),
    )
    .min(1, 'Escolha pelo menos uma conta')
    .max(20),
})
export type BankLinkValues = z.infer<typeof bankLinkSchema>

export const bankConnectionUpdateSchema = z.object({
  startDate: z.iso.date('Data inválida'),
})

/** Lançamento que veio do banco e está esperando aprovação */
export type PendingTransaction = {
  id: string
  date: string
  /** Negativo = saída, como vem do banco */
  amountCents: number
  description: string
  /** Como o banco classificou ("Pix enviado", "Supermercados") */
  kind: string | null
  createdAt: string
}
