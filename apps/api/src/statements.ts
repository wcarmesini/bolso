import {
  addMonthsToDate,
  addMonthsToMonth,
  type CardCycle,
  cardCycleOf,
  statementDates,
  statementFor,
} from '@bolso/shared'
import { and, eq, gte, isNull, or } from 'drizzle-orm'
import type { Database } from './db/client'
import { accounts, transactions } from './db/schema'
import { HttpError } from './http'

/** Mês corrente no servidor ("2026-09") */
export const currentMonth = () => new Date().toISOString().slice(0, 7)

/** Ciclo de fatura da conta, ou nulo se ela não for um cartão configurado. Confere o grupo. */
export async function accountCycle(db: Database, groupId: string, accountId: string | null) {
  if (!accountId) return null
  const [account] = await db
    .select({ type: accounts.type, closingDay: accounts.closingDay, dueDay: accounts.dueDay })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), eq(accounts.groupId, groupId)))
    .limit(1)
  if (!account) throw new HttpError(400, 'Conta não encontrada.', 'accountId')
  return cardCycleOf(account)
}

/**
 * Onde a compra entra no caixa. No cartão, é o vencimento da fatura em que ela caiu;
 * fora do cartão, vale a data de pagamento informada.
 *
 * `installmentIndex` adianta o caixa sem mexer na competência: numa compra em 10x, as dez
 * parcelas são da **data da compra** (é ali que o gasto aconteceu), mas cada uma cai numa
 * fatura diferente — a 1ª na fatura da compra, a 2ª na seguinte, e assim por diante.
 */
export function cashFields(
  purchaseDate: string,
  paymentDate: string | null,
  cycle: CardCycle | null,
  installmentIndex = 0,
) {
  if (!cycle) {
    return {
      statementMonth: null,
      paymentDate: paymentDate ? addMonthsToDate(paymentDate, installmentIndex) : null,
    }
  }
  const primeira = statementFor(purchaseDate, cycle)
  if (installmentIndex === 0) {
    return { statementMonth: primeira.month, paymentDate: primeira.dueDate }
  }
  const month = addMonthsToMonth(primeira.month, installmentIndex)
  return { statementMonth: month, paymentDate: statementDates(month, cycle).dueDate }
}

/**
 * O cartão mudou de fechamento ou vencimento: as compras de faturas ainda não vencidas
 * mudam de fatura como mudariam no banco. Faturas passadas ficam como estão.
 */
export async function refreshOpenStatements(
  db: Database,
  accountId: string,
  cycle: CardCycle | null,
) {
  const month = currentMonth()
  const open = await db
    .select({
      id: transactions.id,
      purchaseDate: transactions.purchaseDate,
      paymentDate: transactions.paymentDate,
      statementMonth: transactions.statementMonth,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        isNull(transactions.deletedAt),
        or(
          gte(transactions.statementMonth, month),
          and(isNull(transactions.statementMonth), gte(transactions.purchaseDate, `${month}-01`)),
        ),
      ),
    )

  for (const row of open) {
    // Deixou de ser cartão: a compra continua paga no dia em que era cobrada
    const next = cycle
      ? cashFields(row.purchaseDate, row.paymentDate, cycle)
      : { statementMonth: null, paymentDate: row.paymentDate }
    if (next.statementMonth === row.statementMonth && next.paymentDate === row.paymentDate) continue
    await db.update(transactions).set(next).where(eq(transactions.id, row.id))
  }
  return open.length
}
