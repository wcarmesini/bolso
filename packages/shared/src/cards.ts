import { addMonthsToMonth, dateInMonth, dayOfDate, monthOfDate } from './dates'

/** Ciclo de um cartão: dia em que a fatura fecha e dia em que ela vence (1 a 31) */
export type CardCycle = { closingDay: number; dueDay: number }

/**
 * Em que fatura cai uma compra no cartão.
 *
 * Regra dos bancos: compra feita no dia do fechamento ou depois já vai para a fatura
 * seguinte (por isso o fechamento é o "melhor dia de compra"). A fatura é chamada pelo mês
 * do vencimento, como as pessoas falam: "a fatura de outubro" é a que vence em outubro.
 */
export function statementFor(purchaseDate: string, cycle: CardCycle) {
  const purchaseMonth = monthOfDate(purchaseDate)
  const closesThisMonth =
    dayOfDate(purchaseDate) < dayOfDate(dateInMonth(purchaseMonth, cycle.closingDay))
  const closingMonth = closesThisMonth ? purchaseMonth : addMonthsToMonth(purchaseMonth, 1)
  return statementFromClosing(closingMonth, cycle)
}

/** Datas de fechamento e vencimento de uma fatura, a partir do mês dela (o do vencimento) */
export function statementDates(month: string, cycle: CardCycle) {
  const closingMonth = dueInClosingMonth(cycle) ? month : addMonthsToMonth(month, -1)
  return statementFromClosing(closingMonth, cycle)
}

// Vencimento depois do fechamento no calendário (fecha 25, vence 5 → vence no mês seguinte)
const dueInClosingMonth = (cycle: CardCycle) => cycle.dueDay > cycle.closingDay

function statementFromClosing(closingMonth: string, cycle: CardCycle) {
  const dueMonth = dueInClosingMonth(cycle) ? closingMonth : addMonthsToMonth(closingMonth, 1)
  return {
    month: dueMonth,
    closingDate: dateInMonth(closingMonth, cycle.closingDay),
    dueDate: dateInMonth(dueMonth, cycle.dueDay),
  }
}
