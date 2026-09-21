/*
 * Repartir dinheiro sem perder centavo. Dividir R$ 100,00 em 3 dá 33,33 + 33,33 + 33,34:
 * a soma das partes precisa bater exatamente com o total, senão relatório e fatura divergem.
 */

/** Divide o total em n parcelas iguais; os centavos que sobram vão para as primeiras */
export function splitInstallments(totalCents: number, count: number): number[] {
  const base = Math.floor(totalCents / count)
  const remainder = totalCents - base * count
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0))
}

/**
 * Reparte um total na mesma proporção dos pesos, pelo método do maior resto.
 * Ex.: dividir uma parcela de R$ 120 entre Mercado (250) e Casa (50) → 100 e 20.
 */
export function prorate(totalCents: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
  if (weightSum <= 0) return weights.map((_, index) => (index === 0 ? totalCents : 0))

  const exact = weights.map((weight) => (totalCents * weight) / weightSum)
  const result = exact.map(Math.floor)
  let missing = totalCents - result.reduce((sum, value) => sum + value, 0)

  // Os centavos que faltam vão para quem ficou com a maior fração descartada
  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
  for (const { index } of byRemainder) {
    if (missing <= 0) break
    result[index] = (result[index] ?? 0) + 1
    missing -= 1
  }
  return result
}
