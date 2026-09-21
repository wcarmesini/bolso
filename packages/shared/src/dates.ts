/*
 * Datas como texto: dia "AAAA-MM-DD" e mês "AAAA-MM", exatamente como ficam no banco.
 * Tudo é aritmética de calendário sobre números, sem objeto Date e sem fuso horário no meio:
 * servidor e navegador chegam sempre ao mesmo resultado.
 */

const pad = (value: number) => String(value).padStart(2, '0')

export function daysInMonth(year: number, month: number) {
  // Dia 0 do mês seguinte = último dia deste mês (UTC para não depender do fuso)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parseMonth(month: string) {
  const [year = 1970, monthNumber = 1] = month.split('-').map(Number)
  return { year, month: monthNumber }
}

export function formatMonth(year: number, month: number) {
  return `${year}-${pad(month)}`
}

/** addMonthsToMonth('2026-11', 3) → '2027-02' */
export function addMonthsToMonth(month: string, count: number) {
  const { year, month: monthNumber } = parseMonth(month)
  const index = year * 12 + (monthNumber - 1) + count
  return formatMonth(Math.floor(index / 12), (index % 12) + 1)
}

/** Um dia dentro do mês, sem passar do fim: dateInMonth('2026-02', 31) → '2026-02-28' */
export function dateInMonth(month: string, day: number) {
  const { year, month: monthNumber } = parseMonth(month)
  return `${month}-${pad(Math.min(day, daysInMonth(year, monthNumber)))}`
}

export function monthOfDate(date: string) {
  return date.slice(0, 7)
}

export function dayOfDate(date: string) {
  return Number(date.slice(8, 10))
}

/** Mesmo dia, n meses depois (31/01 + 1 mês → 28/02) */
export function addMonthsToDate(date: string, count: number) {
  return dateInMonth(addMonthsToMonth(monthOfDate(date), count), dayOfDate(date))
}

/** "2026-09" → do dia 1 (incluído) ao dia 1 do mês seguinte (excluído) */
export function monthRange(month: string) {
  return { from: `${month}-01`, to: `${addMonthsToMonth(month, 1)}-01` }
}
