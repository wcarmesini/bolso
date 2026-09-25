/*
 * O rastro do que se faz no Bolso: quem criou, quem mudou o quê, quem excluiu.
 *
 * Num orçamento de duas pessoas, "quem mexeu nisso?" é uma pergunta de todo dia. O histórico
 * responde sem ninguém precisar perguntar — e como excluir só marca, dá para trazer de volta.
 */

export const auditEntities = [
  'transaction',
  'transfer',
  'category',
  'account',
  'contact',
  'budget',
] as const
export type AuditEntity = (typeof auditEntities)[number]

export const auditActions = ['create', 'update', 'delete', 'restore'] as const
export type AuditAction = (typeof auditActions)[number]

/** Um campo que mudou. `from` e `to` vêm como o banco guarda (texto, número, nulo). */
export type AuditField = { field: string; from: unknown; to: unknown }

export type AuditEntry = {
  id: string
  entity: AuditEntity
  entityId: string
  action: AuditAction
  /** Como a coisa se chamava na hora do registro */
  label: string
  changes: AuditField[]
  actorName: string
  createdAt: string
}

export const auditActionLabels: Record<AuditAction, string> = {
  create: 'criou',
  update: 'alterou',
  delete: 'excluiu',
  restore: 'restaurou',
}

/** O nome dos campos em português, para o histórico não falar em inglês */
export const auditFieldLabels: Record<string, string> = {
  type: 'tipo',
  amountCents: 'valor',
  description: 'descrição',
  accountId: 'conta',
  contactId: 'contato',
  purchaseDate: 'data da compra',
  paymentDate: 'data do pagamento',
  statementMonth: 'fatura',
  notes: 'observação',
  categoryId: 'categoria',
  splits: 'categorias',
  name: 'nome',
  color: 'cor',
  icon: 'ícone',
  parentId: 'categoria principal',
  limitCents: 'limite',
  initialBalanceCents: 'saldo inicial',
  closingDay: 'dia do fechamento',
  dueDay: 'dia do vencimento',
  kind: 'tipo',
  document: 'documento',
  fromAccountId: 'conta de origem',
  toAccountId: 'conta de destino',
  date: 'data',
}

export const auditFieldLabel = (field: string) => auditFieldLabels[field] ?? field
