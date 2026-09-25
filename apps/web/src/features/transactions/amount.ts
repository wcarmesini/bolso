import type { Transaction, TransactionType } from '@bolso/shared'
import { formatCents } from '@/lib/money'

/*
 * Cor de entrada e saída. É a mesma exceção das cores de categoria: cor de dado, não de tema
 * (a regra "cor forte só em ações, no azul da marca" continua valendo para o resto).
 */
export const amountTone: Record<TransactionType, string> = {
  expense: 'text-foreground',
  income: 'text-emerald-600 dark:text-emerald-400',
}

/** "+R$ 3.000,00" ou "−R$ 250,00" (sinal de menos de verdade, não hífen) */
export function formatSignedCents(type: TransactionType, cents: number) {
  return `${type === 'income' ? '+' : '−'}${formatCents(cents)}`
}

/**
 * Entradas, saídas e o que sobra no mês.
 *
 * Transferência entre contas fica de fora: o dinheiro só mudou de lugar, e contá-la
 * dobraria o mês (uma saída e uma entrada do mesmo valor, no mesmo dia).
 */
export function summarize(transactions: Transaction[]) {
  let income = 0
  let expense = 0
  for (const transaction of transactions) {
    if (transaction.transfer) continue
    if (transaction.type === 'income') income += transaction.amountCents
    else expense += transaction.amountCents
  }
  return { income, expense, balance: income - expense }
}
