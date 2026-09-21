/*
 * Datas no formato do banco: dia "AAAA-MM-DD" e mês "AAAA-MM".
 *
 * Tudo é montado com as partes locais da data, nunca com `toISOString()`: ele converte para
 * UTC e, à noite, devolveria o dia seguinte para quem está no Brasil. Um lançamento feito
 * às 22h precisa cair no dia de hoje, não no de amanhã.
 */

import { addMonthsToMonth, monthOfDate } from '@bolso/shared'

const pad = (value: number) => String(value).padStart(2, '0')

export function toISODate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function today() {
  return toISODate(new Date())
}

export function currentMonth() {
  return monthOfDate(today())
}

/** Mês vizinho: shiftMonth('2026-01', -1) → '2025-12' (a conta mora no pacote compartilhado) */
export const shiftMonth = addMonthsToMonth

/** Data local a partir do texto, sem passar por UTC */
function parseISODate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1)
}

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
})
const shortMonthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const shortDateFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })

/** "2026-09" → "setembro de 2026" */
export function monthLabel(month: string) {
  return monthFormat.format(parseISODate(`${month}-01`))
}

/** "2026-10" → "out/26", para caber numa linha da lista */
export function shortMonthLabel(month: string) {
  const name = shortMonthFormat.format(parseISODate(`${month}-01`)).replace('.', '')
  return `${name}/${month.slice(2, 4)}`
}

/** "2026-10-05" → "05/10" */
export function shortDate(isoDate: string) {
  return shortDateFormat.format(parseISODate(isoDate))
}

/** "hoje", "ontem" ou "sáb., 20 de set." — o cabeçalho de cada dia na lista */
export function dayLabel(isoDate: string) {
  const diff = daysFromToday(isoDate)
  if (diff === 0) return 'hoje'
  if (diff === -1) return 'ontem'
  if (diff === 1) return 'amanhã'
  return dayFormat.format(parseISODate(isoDate))
}

function daysFromToday(isoDate: string) {
  const day = parseISODate(isoDate)
  const now = parseISODate(today())
  return Math.round((day.getTime() - now.getTime()) / 86_400_000)
}
