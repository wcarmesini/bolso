/*
 * A conciliação é o mecanismo de conferência do Bolso: dizer que **este** lançamento é
 * **aquele** movimento do banco. Quando vale, o número deixa de ser o que alguém digitou e
 * passa a ser o que o banco confirma.
 *
 * Por isso ela trava o lançamento: valor, conta e tipo são o que identificam o movimento, e
 * mudá-los depois de conciliar desfaria a prova sem ninguém perceber. Para mexer neles (ou
 * excluir), primeiro se desfaz a conciliação — de propósito, num passo visível.
 */

export const reconciliationSources = ['pluggy', 'ofx'] as const
export type ReconciliationSource = (typeof reconciliationSources)[number]

export const reconciliationSourceLabels: Record<ReconciliationSource, string> = {
  pluggy: 'Open Finance',
  ofx: 'extrato OFX',
}

/** Uma prova: o movimento do banco que corresponde a este lançamento */
export type TransactionSource = {
  id: string
  source: ReconciliationSource
  externalId: string
  /** Como o banco chamava o movimento */
  label: string
  createdAt: string
}

/*
 * O que não pode mudar enquanto o lançamento está conciliado. A descrição, a categoria, o
 * contato e as datas continuam livres: melhorar a descrição de um lançamento conferido é
 * justamente o que se espera que as pessoas façam.
 */
export const lockedWhenReconciled = ['amountCents', 'accountId', 'type'] as const
export type LockedField = (typeof lockedWhenReconciled)[number]

export const isReconciled = (sources: TransactionSource[] | undefined) => (sources?.length ?? 0) > 0

/** "Open Finance e extrato OFX" — de onde vem a conferência deste lançamento */
export function reconciliationLabel(sources: TransactionSource[]) {
  const nomes = [...new Set(sources.map((item) => reconciliationSourceLabels[item.source]))]
  if (nomes.length === 0) return ''
  if (nomes.length === 1) return nomes[0] as string
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`
}
