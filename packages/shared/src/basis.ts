/*
 * Regime de data. Todo lançamento tem duas: a da compra e a do pagamento.
 *
 * - **Competência** (`accrual`): conta no mês da compra. É quando o gasto aconteceu,
 *   e é assim que o orçamento enxerga o mundo.
 * - **Caixa** (`cash`): conta no dia em que o dinheiro se move — a data do pagamento,
 *   que no cartão é o vencimento da fatura. Sem data de pagamento, vale a da compra.
 */
export const reportBases = ['accrual', 'cash'] as const
export type ReportBasis = (typeof reportBases)[number]

export const reportBasisLabels: Record<ReportBasis, string> = {
  accrual: 'Competência',
  cash: 'Caixa',
}

/** Explicação curta, para a dica ao lado do seletor */
export const reportBasisHints: Record<ReportBasis, string> = {
  accrual: 'Conta no mês da compra',
  cash: 'Conta quando o dinheiro sai',
}
