import {
  addMonthsToMonth,
  type BudgetLine,
  type BudgetReport,
  type CashFlowMonth,
  type CategoriesReport,
  type CategoryTotal,
  categoryStyle,
  formatMonth,
  isLiability,
  type MonthlyReport,
  type MonthlyRow,
  type MonthlySection,
  monthlyReportQuerySchema,
  monthRange,
  monthsPerInterval,
  type NetWorthReport,
  type NetWorthRow,
  netWorthQuerySchema,
  type PeopleReport,
  type PersonTotal,
  reportMonthQuerySchema,
  reportYearQuerySchema,
  type TransactionType,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, asc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { accounts, categories, member, transactionSplits, transactions, user } from '../db/schema'
import { type AppEnv, type Deps, onInvalid } from '../http'
import { effectiveBudgets } from './budgets'

/*
 * Relatórios. Regra de data:
 * - Gastos por categoria, orçamento e por pessoa: pela DATA DA COMPRA (competência),
 *   que é o mês em que o gasto "conta". Parcelas contam cada uma no seu mês.
 * - Fluxo de caixa: pelo dia em que o dinheiro entra ou sai (data do pagamento; no cartão,
 *   o vencimento da fatura). Sem data de pagamento, vale a data da compra.
 * As categorias vêm sempre das partes do lançamento: um lançamento dividido entre
 * Mercado e Casa conta o pedaço certo em cada uma.
 */

const sum = (column: typeof transactionSplits.amountCents | typeof transactions.amountCents) =>
  sql<number>`coalesce(sum(${column}), 0)`.mapWith(Number)

/*
 * Transferência entre contas fica fora de todo relatório: o dinheiro só mudou de bolso.
 * Sem isto, passar R$ 1.000 da conta para a poupança viraria R$ 1.000 de gasto e de receita.
 */
const semTransferencia = isNull(transactions.transferGroupId)

/** Lançamento excluído continua no banco, mas não entra em relatório nenhum */
const naoExcluido = isNull(transactions.deletedAt)

/** Quanto foi para cada categoria (a de verdade, ainda sem subir para a principal) */
async function totalsByCategory(
  db: Database,
  groupId: string,
  month: string,
  type: TransactionType,
) {
  const range = monthRange(month)
  const rows = await db
    .select({
      categoryId: transactionSplits.categoryId,
      totalCents: sum(transactionSplits.amountCents),
    })
    .from(transactionSplits)
    .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
    .where(
      and(
        eq(transactions.groupId, groupId),
        naoExcluido,
        eq(transactions.type, type),
        semTransferencia,
        gte(transactions.purchaseDate, range.from),
        lt(transactions.purchaseDate, range.to),
      ),
    )
    .groupBy(transactionSplits.categoryId)
  return new Map(rows.map((row) => [row.categoryId, row.totalCents]))
}

/** Sobe as subcategorias para a principal, guardando o detalhe delas */
async function rollUp(db: Database, groupId: string, totals: Map<string | null, number>) {
  const all = await db.select().from(categories).where(eq(categories.groupId, groupId))
  const byId = new Map(all.map((category) => [category.id, category]))
  const lines = new Map<string | null, CategoryTotal>()

  const lineFor = (topId: string | null) => {
    const existing = lines.get(topId)
    if (existing) return existing
    const top = topId ? byId.get(topId) : undefined
    const line: CategoryTotal = {
      categoryId: topId,
      name: top?.name ?? 'Sem categoria',
      icon: top ? categoryStyle(top).icon : null,
      color: top ? categoryStyle(top).color : null,
      totalCents: 0,
      children: [],
    }
    lines.set(topId, line)
    return line
  }

  for (const [categoryId, totalCents] of totals) {
    const category = categoryId ? byId.get(categoryId) : undefined
    if (category?.parentId) {
      const line = lineFor(category.parentId)
      line.totalCents += totalCents
      line.children.push({ categoryId: category.id, name: category.name, totalCents })
    } else {
      lineFor(category ? category.id : null).totalCents += totalCents
    }
  }

  for (const line of lines.values()) line.children.sort((a, b) => b.totalCents - a.totalCents)
  return { lines: [...lines.values()].sort((a, b) => b.totalCents - a.totalCents), byId }
}

const categoriesQuerySchema = reportMonthQuerySchema.extend({
  type: z.enum(['expense', 'income']).default('expense'),
})

export function reportsRoutes(deps: Deps) {
  const { db } = deps

  return (
    new Hono<AppEnv>()
      .get('/cash-flow', zValidator('query', reportYearQuerySchema, onInvalid), async (c) => {
        const { year } = c.req.valid('query')
        const cashDate = sql`coalesce(${transactions.paymentDate}, ${transactions.purchaseDate})`
        const month = sql<string>`to_char(${cashDate}, 'YYYY-MM')`
        const rows = await db
          .select({ month, type: transactions.type, totalCents: sum(transactions.amountCents) })
          .from(transactions)
          .where(
            and(
              eq(transactions.groupId, c.var.groupId),
              naoExcluido,
              semTransferencia,
              sql`${cashDate} >= ${`${year}-01-01`}::date`,
              sql`${cashDate} < ${`${year + 1}-01-01`}::date`,
            ),
          )
          .groupBy(month, transactions.type)

        const months: CashFlowMonth[] = Array.from({ length: 12 }, (_, index) => ({
          month: formatMonth(year, index + 1),
          incomeCents: 0,
          expenseCents: 0,
        }))
        for (const row of rows) {
          const target = months.find((item) => item.month === row.month)
          if (!target) continue
          if (row.type === 'income') target.incomeCents += row.totalCents
          else target.expenseCents += row.totalCents
        }
        return c.json({ year, months })
      })

      .get('/categories', zValidator('query', categoriesQuerySchema, onInvalid), async (c) => {
        const { month, type } = c.req.valid('query')
        const totals = await totalsByCategory(db, c.var.groupId, month, type)
        const { lines } = await rollUp(db, c.var.groupId, totals)
        const report: CategoriesReport = {
          month,
          totalCents: lines.reduce((total, line) => total + line.totalCents, 0),
          categories: lines,
        }
        return c.json(report)
      })

      /*
       * Orçado × realizado, em árvore. Cada categoria principal traz as subcategorias que
       * têm orçamento ou gasto; assim dá para orçar no detalhe sem perder o total de cima.
       */
      .get('/budget', zValidator('query', reportMonthQuerySchema, onInvalid), async (c) => {
        const { month } = c.req.valid('query')
        const groupId = c.var.groupId
        const [despesas, receitas, orcamentos, todas] = await Promise.all([
          totalsByCategory(db, groupId, month, 'expense'),
          totalsByCategory(db, groupId, month, 'income'),
          effectiveBudgets(db, groupId, month),
          db.select().from(categories).where(eq(categories.groupId, groupId)),
        ])

        const orcamentoPor = new Map(orcamentos.map((budget) => [budget.categoryId, budget]))
        const gastoDe = (type: TransactionType, categoryId: string) =>
          (type === 'expense' ? despesas : receitas).get(categoryId) ?? 0

        const montar = (type: TransactionType): BudgetLine[] => {
          const principais = todas.filter((item) => !item.parentId && item.kind === type)
          return principais
            .map((parent) => {
              const filhas = todas
                .filter((item) => item.parentId === parent.id)
                .map((child) => {
                  const budget = orcamentoPor.get(child.id)
                  return {
                    categoryId: child.id,
                    name: child.name,
                    ...categoryStyle(parent),
                    limitCents: budget?.limitCents ?? null,
                    ownLimitCents: budget?.limitCents ?? null,
                    spentCents: gastoDe(type, child.id),
                    items: budget?.items ?? [],
                    children: [] as BudgetLine[],
                  }
                })
                .filter((child) => child.limitCents !== null || child.spentCents > 0)

              const budget = orcamentoPor.get(parent.id)
              const gastoProprio = gastoDe(type, parent.id)
              const gastoTotal =
                gastoProprio + filhas.reduce((total, child) => total + child.spentCents, 0)
              // Sem orçamento próprio, o da principal é a soma do que foi orçado nas filhas
              const orcadoFilhas = filhas.reduce(
                (total, child) => total + (child.limitCents ?? 0),
                0,
              )
              const limitCents = budget?.limitCents ?? (orcadoFilhas > 0 ? orcadoFilhas : null)

              return {
                categoryId: parent.id,
                name: parent.name,
                ...categoryStyle(parent),
                limitCents,
                ownLimitCents: budget?.limitCents ?? null,
                spentCents: gastoTotal,
                items: budget?.items ?? [],
                children: filhas.sort((a, b) => b.spentCents - a.spentCents),
              }
            })
            .filter((line) => line.limitCents !== null || line.spentCents > 0)
            .sort((a, b) => b.spentCents - a.spentCents || a.name.localeCompare(b.name, 'pt-BR'))
        }

        const report: BudgetReport = { month, expense: montar('expense'), income: montar('income') }
        return c.json(report)
      })

      /*
       * Mês a mês por categoria: as categorias nas linhas, os períodos nas colunas.
       * O intervalo pode juntar meses (trimestre, ano) a partir do mês inicial escolhido.
       * Uma consulta só devolve mês + categoria + tipo; o resto é agrupamento aqui.
       */
      .get('/monthly', zValidator('query', monthlyReportQuerySchema, onInvalid), async (c) => {
        const { start, count, interval, basis } = c.req.valid('query')
        /*
         * Competência lê a data da compra; caixa, o dia em que o dinheiro se move — a data
         * do pagamento (no cartão, o vencimento da fatura) e, sem ela, a própria compra.
         */
        const date =
          basis === 'cash'
            ? sql`coalesce(${transactions.paymentDate}, ${transactions.purchaseDate})`
            : sql`${transactions.purchaseDate}`
        const step = monthsPerInterval[interval]
        const periods = Array.from({ length: count }, (_, index) => ({
          start: addMonthsToMonth(start, index * step),
          end: addMonthsToMonth(start, index * step + step - 1),
        }))
        const last = periods.at(-1)?.end ?? start
        const range = { from: `${start}-01`, to: `${addMonthsToMonth(last, 1)}-01` }

        // Em que coluna cai cada mês do intervalo
        const columnOfMonth = new Map<string, number>()
        for (const [index, period] of periods.entries()) {
          for (let offset = 0; offset < step; offset += 1) {
            columnOfMonth.set(addMonthsToMonth(period.start, offset), index)
          }
        }

        const month = sql<string>`to_char(${date}, 'YYYY-MM')`
        const rows = await db
          .select({
            month,
            type: transactions.type,
            categoryId: transactionSplits.categoryId,
            totalCents: sum(transactionSplits.amountCents),
          })
          .from(transactionSplits)
          .innerJoin(transactions, eq(transactions.id, transactionSplits.transactionId))
          .where(
            and(
              eq(transactions.groupId, c.var.groupId),
              naoExcluido,
              semTransferencia,
              gte(date, range.from),
              lt(date, range.to),
            ),
          )
          .groupBy(month, transactions.type, transactionSplits.categoryId)

        const all = await db.select().from(categories).where(eq(categories.groupId, c.var.groupId))
        const byId = new Map(all.map((category) => [category.id, category]))
        const zeros = () => Array.from({ length: count }, () => 0)

        const sections: Record<TransactionType, Map<string | null, MonthlyRow>> = {
          expense: new Map(),
          income: new Map(),
        }

        for (const row of rows) {
          const index = columnOfMonth.get(row.month)
          if (index === undefined) continue
          const category = row.categoryId ? byId.get(row.categoryId) : undefined
          const parent = category?.parentId ? byId.get(category.parentId) : undefined
          const top = parent ?? category
          const section = sections[row.type]

          let line = section.get(top?.id ?? null)
          if (!line) {
            line = {
              categoryId: top?.id ?? null,
              name: top?.name ?? 'Sem categoria',
              icon: top ? categoryStyle(top).icon : null,
              color: top ? categoryStyle(top).color : null,
              values: zeros(),
              totalCents: 0,
              children: [],
            }
            section.set(top?.id ?? null, line)
          }
          line.values[index] = (line.values[index] ?? 0) + row.totalCents
          line.totalCents += row.totalCents

          // Lançado direto na subcategoria: ela também aparece dentro da principal
          if (parent && category) {
            let child = line.children.find((item) => item.categoryId === category.id)
            if (!child) {
              child = {
                categoryId: category.id,
                name: category.name,
                values: zeros(),
                totalCents: 0,
              }
              line.children.push(child)
            }
            child.values[index] = (child.values[index] ?? 0) + row.totalCents
            child.totalCents += row.totalCents
          }
        }

        const toSection = (lines: MonthlyRow[]): MonthlySection => {
          const values = zeros()
          let totalCents = 0
          for (const line of lines) {
            line.children.sort((a, b) => b.totalCents - a.totalCents)
            for (const [index, value] of line.values.entries()) {
              values[index] = (values[index] ?? 0) + value
            }
            totalCents += line.totalCents
          }
          return { rows: lines.sort((a, b) => b.totalCents - a.totalCents), values, totalCents }
        }

        const report: MonthlyReport = {
          interval,
          basis,
          periods,
          income: toSection([...sections.income.values()]),
          expense: toSection([...sections.expense.values()]),
        }
        return c.json(report)
      })

      /*
       * Evolução patrimonial: o saldo de cada conta ao fim de cada período.
       *
       * O saldo é o saldo inicial da conta mais tudo o que entrou menos tudo o que saiu até
       * ali, pela data em que o dinheiro se move. A transferência entra na conta: ela não
       * muda o patrimônio, mas muda o saldo das duas pontas — e é isso que esta tela mostra.
       *
       * O cartão de crédito não tem saldo inicial: ele fica negativo conforme se compra e
       * volta a zero quando a fatura é paga. Por isso aparece do lado do que se deve, com o
       * sinal virado.
       */
      .get('/net-worth', zValidator('query', netWorthQuerySchema, onInvalid), async (c) => {
        const { start, count, interval } = c.req.valid('query')
        const step = monthsPerInterval[interval]
        const periods = Array.from({ length: count }, (_, index) => ({
          start: addMonthsToMonth(start, index * step),
          end: addMonthsToMonth(start, index * step + step - 1),
        }))
        const ultimoMes = periods.at(-1)?.end ?? start
        // Até o fim do último período (exclusivo): o que vier depois não entra em coluna nenhuma
        const limite = `${addMonthsToMonth(ultimoMes, 1)}-01`

        const quando = sql`coalesce(${transactions.paymentDate}, ${transactions.purchaseDate})`
        const mes = sql<string>`to_char(${quando}, 'YYYY-MM')`
        const movimentos = await db
          .select({
            accountId: transactions.accountId,
            month: mes,
            type: transactions.type,
            totalCents: sum(transactions.amountCents),
          })
          .from(transactions)
          .where(and(eq(transactions.groupId, c.var.groupId), naoExcluido, lt(quando, limite)))
          .groupBy(transactions.accountId, mes, transactions.type)

        const contas = await db
          .select()
          .from(accounts)
          .where(eq(accounts.groupId, c.var.groupId))
          .orderBy(asc(accounts.name))

        /** Quanto cada conta se moveu em cada mês (positivo entrou, negativo saiu) */
        const porContaEMes = new Map<string, Map<string, number>>()
        for (const linha of movimentos) {
          if (!linha.accountId) continue
          const daConta = porContaEMes.get(linha.accountId) ?? new Map<string, number>()
          const valor = Number(linha.totalCents ?? 0) * (linha.type === 'income' ? 1 : -1)
          daConta.set(linha.month, (daConta.get(linha.month) ?? 0) + valor)
          porContaEMes.set(linha.accountId, daConta)
        }

        const zeros = () => Array.from({ length: count }, () => 0)

        const linhaDaConta = (conta: (typeof contas)[number]): NetWorthRow => {
          const daConta = porContaEMes.get(conta.id) ?? new Map<string, number>()
          const values = zeros()
          // Tudo o que aconteceu antes da primeira coluna já nasce dentro do saldo
          let saldo = conta.initialBalanceCents
          for (const [mesMovimentado, valor] of daConta) {
            if (mesMovimentado < start) saldo += valor
          }
          for (const [indice, period] of periods.entries()) {
            for (let offset = 0; offset < step; offset += 1) {
              saldo += daConta.get(addMonthsToMonth(period.start, offset)) ?? 0
            }
            values[indice] = saldo
          }
          return { accountId: conta.id, name: conta.name, type: conta.type, values }
        }

        const somar = (rows: NetWorthRow[]) => {
          const total = zeros()
          for (const row of rows) {
            for (const [indice, valor] of row.values.entries()) total[indice] += valor
          }
          return total
        }

        const doLadoDoQueSeTem = contas.filter((conta) => !isLiability(conta.type))
        const cartoes = contas.filter((conta) => isLiability(conta.type))

        const assets = { rows: doLadoDoQueSeTem.map(linhaDaConta), values: zeros() }
        assets.values = somar(assets.rows)

        // Dívida vira número positivo: "devo R$ 1.200" lê melhor que "tenho −R$ 1.200"
        const liabilities = {
          rows: cartoes.map(linhaDaConta).map((row) => ({
            ...row,
            values: row.values.map((valor) => -valor),
          })),
          values: zeros(),
        }
        liabilities.values = somar(liabilities.rows)

        const netValues = assets.values.map(
          (valor, indice) => valor - (liabilities.values[indice] ?? 0),
        )
        const changeValues = netValues.map((valor, indice) =>
          indice === 0 ? 0 : valor - (netValues[indice - 1] ?? 0),
        )

        const report: NetWorthReport = {
          interval,
          periods,
          assets,
          liabilities,
          netValues,
          changeValues,
        }
        return c.json(report)
      })

      .get('/people', zValidator('query', reportMonthQuerySchema, onInvalid), async (c) => {
        const { month } = c.req.valid('query')
        const range = monthRange(month)
        const rows = await db
          .select({
            userId: transactions.createdBy,
            type: transactions.type,
            totalCents: sum(transactions.amountCents),
            count: sql<number>`count(*)`.mapWith(Number),
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.groupId, c.var.groupId),
              naoExcluido,
              semTransferencia,
              gte(transactions.purchaseDate, range.from),
              lt(transactions.purchaseDate, range.to),
            ),
          )
          .groupBy(transactions.createdBy, transactions.type)

        // Todo mundo do grupo aparece, mesmo sem lançamento; e quem saiu, se lançou no mês
        const members = await db
          .select({ userId: member.userId })
          .from(member)
          .where(eq(member.organizationId, c.var.groupId))
        const userIds = [
          ...new Set([...members.map((row) => row.userId), ...rows.map((row) => row.userId)]),
        ]
        const users = userIds.length
          ? await db
              .select({ id: user.id, name: user.name, image: user.image })
              .from(user)
              .where(inArray(user.id, userIds))
          : []

        const people = new Map<string, PersonTotal>(
          users.map((person) => [
            person.id,
            {
              userId: person.id,
              name: person.name,
              image: person.image ?? null,
              expenseCents: 0,
              incomeCents: 0,
              count: 0,
            },
          ]),
        )
        for (const row of rows) {
          const person = people.get(row.userId)
          if (!person) continue
          if (row.type === 'income') person.incomeCents += row.totalCents
          else person.expenseCents += row.totalCents
          person.count += row.count
        }
        const report: PeopleReport = {
          month,
          people: [...people.values()].sort(
            (a, b) => b.expenseCents - a.expenseCents || a.name.localeCompare(b.name),
          ),
        }
        return c.json(report)
      })
  )
}
