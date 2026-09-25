import type { ImportMatch, ImportRow, ReconciliationSource } from '@bolso/shared'
import { and, eq, gte, inArray, isNull, lte } from 'drizzle-orm'
import type { Database } from '../db/client'
import { categories, transactionSources, transactionSplits, transactions } from '../db/schema'

/*
 * Conciliar é dizer "este lançamento do banco é aquele que eu já tinha lançado". Ao ligar os
 * dois, o lançamento existente passa a carregar o identificador do banco, e o que veio de
 * fora não vira lançamento repetido — nem agora, nem numa próxima busca.
 *
 * O mesmo motor serve ao extrato OFX e ao banco conectado: os dois entregam uma lista de
 * linhas com identificador, data, valor e descrição, e o resto é igual.
 */

/** Quantos dias de diferença ainda contam como o mesmo lançamento (compra hoje, cai amanhã) */
export const DIAS_DE_TOLERANCIA = 4

export const dias = (date: string, quantidade: number) => {
  const base = new Date(`${date}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + quantidade)
  return base.toISOString().slice(0, 10)
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Palavras que valem para comparar duas descrições (as curtinhas não dizem nada) */
const palavras = (texto: string) =>
  new Set(
    semAcento(texto)
      .split(/[^a-z0-9]+/)
      .filter((palavra) => palavra.length >= 3),
  )

/** De 0 a 1: quanto duas descrições têm em comum */
function semelhanca(a: string, b: string) {
  const umas = palavras(a)
  const outras = palavras(b)
  if (umas.size === 0 || outras.size === 0) return 0
  let iguais = 0
  for (const palavra of umas) if (outras.has(palavra)) iguais += 1
  return iguais / Math.min(umas.size, outras.size)
}

/**
 * Nota de um par (linha de fora × lançamento já feito). Mesma data vale mais que a descrição
 * parecida, porque descrição de banco raramente bate com o que a pessoa digitou — mas quando
 * bate, é sinal forte e desempata dois lançamentos do mesmo valor.
 */
function pontuar(
  item: { date: string; description: string },
  row: { purchaseDate: string; description: string },
) {
  const distancia = Math.round(
    Math.abs(Date.parse(`${row.purchaseDate}T12:00:00Z`) - Date.parse(`${item.date}T12:00:00Z`)) /
      86_400_000,
  )
  return 1000 - distancia * 50 + semelhanca(item.description, row.description) * 120
}

/** Do banco para o Bolso: valor sempre positivo, o sinal vira o tipo */
export const tipoDe = (amountCents: number) => (amountCents < 0 ? 'expense' : 'income')

/** Uma linha vinda de fora: do extrato ou da caixa de entrada do banco */
export type LinhaDeFora = {
  fitId: string
  date: string
  /** Negativo = saída */
  amountCents: number
  description: string
  kind: string | null
  /** "2 de 10" e a data da compra, quando o banco conta que é uma parcela */
  installment: { number: number; count: number; purchaseDate: string } | null
}

export type Existente = {
  id: string
  description: string
  purchaseDate: string
  amountCents: number
  type: 'expense' | 'income'
  /*
   * A prova que este lançamento já carrega **desta origem**, se houver. Conciliado com o
   * Open Finance, ele continua livre para conciliar com o extrato: é o mesmo movimento
   * chegando por dois caminhos, e as duas confirmações valem.
   */
  externalId: string | null
}

/** Lançamentos da conta na janela das linhas de fora, para procurar parecidos e já entrados */
export async function carregarExistentes(
  db: Database,
  groupId: string,
  accountId: string,
  linhas: { date: string }[],
  source: ReconciliationSource,
): Promise<Existente[]> {
  const datas = linhas.map((item) => item.date).sort()
  const primeira = datas[0] ?? '1970-01-01'
  const ultima = datas.at(-1) ?? '2999-12-31'
  return (
    db
      .select({
        id: transactions.id,
        description: transactions.description,
        purchaseDate: transactions.purchaseDate,
        amountCents: transactions.amountCents,
        type: transactions.type,
        externalId: transactionSources.externalId,
      })
      .from(transactions)
      /*
       * A prova entra por fora e só a desta origem: um lançamento já conferido pelo extrato
       * continua disponível para conciliar com o Open Finance, e vice-versa.
       */
      .leftJoin(
        transactionSources,
        and(
          eq(transactionSources.transactionId, transactions.id),
          eq(transactionSources.source, source),
        ),
      )
      .where(
        and(
          eq(transactions.groupId, groupId),
          // Excluído não aparece como candidato a par nem como "sem par no extrato"
          isNull(transactions.deletedAt),
          eq(transactions.accountId, accountId),
          gte(transactions.purchaseDate, dias(primeira, -DIAS_DE_TOLERANCIA)),
          lte(transactions.purchaseDate, dias(ultima, DIAS_DE_TOLERANCIA)),
        ),
      )
  )
}

/** Nome da categoria de cada lançamento, para a tela mostrar o que está conciliando */
export async function categoriasDe(db: Database, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>()
  const rows = await db
    .select({ transactionId: transactionSplits.transactionId, name: categories.name })
    .from(transactionSplits)
    .innerJoin(categories, eq(categories.id, transactionSplits.categoryId))
    .where(inArray(transactionSplits.transactionId, ids))
  return new Map(rows.map((row) => [row.transactionId, row.name]))
}

export function conciliar(
  linhas: LinhaDeFora[],
  existentes: Existente[],
  nomeDaCategoria: Map<string, string>,
): { rows: ImportRow[]; unmatched: ImportMatch[]; available: ImportMatch[] } {
  const porExternalId = new Map(
    existentes.flatMap((row) => (row.externalId ? [[row.externalId, row] as const] : [])),
  )

  const comoMatch = (row: Existente): ImportMatch => ({
    id: row.id,
    description: row.description,
    purchaseDate: row.purchaseDate,
    amountCents: row.amountCents,
    categoryName: nomeDaCategoria.get(row.id) ?? null,
    type: row.type,
  })

  const deFora = linhas.filter((item) => !porExternalId.has(item.fitId))
  const livres = existentes.filter((row) => !row.externalId)

  /*
   * Todos os pares possíveis, com nota. Valor e tipo têm de bater; o resto é o que separa
   * dois lançamentos de mesmo valor: a distância entre as datas e o quanto as descrições
   * têm em comum ("PAG*MERCADO SAO JOSE" e "Mercado São José" dividem duas palavras).
   */
  const pares = deFora.flatMap((item) =>
    livres
      .filter(
        (row) =>
          row.amountCents === Math.abs(item.amountCents) &&
          row.type === tipoDe(item.amountCents) &&
          row.purchaseDate >= dias(item.date, -DIAS_DE_TOLERANCIA) &&
          row.purchaseDate <= dias(item.date, DIAS_DE_TOLERANCIA),
      )
      .map((row) => ({ item, row, pontos: pontuar(item, row) })),
  )

  /*
   * Melhor par primeiro, na lista inteira. O jeito antigo — primeira linha escolhe primeiro —
   * fazia a linha de cima levar um lançamento que combinava muito mais com outra logo abaixo,
   * e as duas saíam erradas.
   */
  pares.sort((a, b) => b.pontos - a.pontos)
  const escolhidoDe = new Map<string, Existente>()
  const jaUsado = new Set<string>()
  for (const par of pares) {
    if (escolhidoDe.has(par.item.fitId) || jaUsado.has(par.row.id)) continue
    escolhidoDe.set(par.item.fitId, par.row)
    jaUsado.add(par.row.id)
  }

  // Os outros candidatos de cada linha ficam à mão, para trocar o par na tela
  const candidatosDe = new Map<string, ImportMatch[]>()
  for (const par of pares) {
    const lista = candidatosDe.get(par.item.fitId) ?? []
    if (lista.length < 6) lista.push(comoMatch(par.row))
    candidatosDe.set(par.item.fitId, lista)
  }

  const rows = linhas.map((item): ImportRow => {
    const jaImportado = porExternalId.get(item.fitId)
    if (jaImportado) {
      return { ...item, status: 'imported', match: comoMatch(jaImportado), candidates: [] }
    }
    const escolhido = escolhidoDe.get(item.fitId)
    const candidates = candidatosDe.get(item.fitId) ?? []
    if (!escolhido) return { ...item, status: 'new', match: null, candidates }
    return { ...item, status: 'match', match: comoMatch(escolhido), candidates }
  })

  /*
   * Sobrou no Bolso: está lançado nesta conta e neste período, mas não veio do banco. Pode ser
   * valor ou data errados, conta trocada, ou algo que o banco ainda não processou. Aparece na
   * tela para a pessoa ver o problema em vez de descobrir depois.
   */
  const porData = (a: { purchaseDate: string }, b: { purchaseDate: string }) =>
    a.purchaseDate.localeCompare(b.purchaseDate)

  return {
    rows,
    unmatched: livres
      .filter((row) => !jaUsado.has(row.id))
      .sort(porData)
      .map(comoMatch),
    available: [...livres].sort(porData).map(comoMatch),
  }
}
