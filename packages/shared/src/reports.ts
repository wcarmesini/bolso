import { z } from 'zod'
import type { AccountType } from './accounts'
import { type ReportBasis, reportBases } from './basis'
import type { BudgetItem } from './budgets'
import type { CategoryColor, CategoryIconName } from './categories'
import { monthSchema } from './transactions'

export const reportMonthQuerySchema = z.object({ month: monthSchema })
export const reportYearQuerySchema = z.object({
  year: z.coerce.number().int().min(2000, 'Ano inválido').max(2100, 'Ano inválido'),
})

/**
 * Fluxo de caixa: pelo dia em que o dinheiro entra ou sai (data do pagamento; no cartão,
 * o vencimento da fatura). O que ainda não tem data de pagamento conta pela data da compra.
 */
export type CashFlowMonth = { month: string; incomeCents: number; expenseCents: number }
export type CashFlowReport = { year: number; months: CashFlowMonth[] }

/** Gastos por categoria no mês (pela data da compra), com as subcategorias dentro da principal */
export type CategoryTotal = {
  /** Nulo = lançamentos sem categoria */
  categoryId: string | null
  name: string
  icon: CategoryIconName | null
  color: CategoryColor | null
  totalCents: number
  children: { categoryId: string; name: string; totalCents: number }[]
}
export type CategoriesReport = { month: string; totalCents: number; categories: CategoryTotal[] }

/**
 * Orçado × realizado. As linhas vêm em árvore: a categoria principal traz as subcategorias
 * que têm orçamento ou gasto. Uma principal com orçamento próprio manda no total; sem ele,
 * vale a soma das subcategorias — assim nada é contado duas vezes.
 */
export type BudgetLine = {
  categoryId: string
  name: string
  icon: CategoryIconName | null
  color: CategoryColor | null
  /** O que vale para a linha: o orçamento próprio ou, na principal sem um, a soma das filhas */
  limitCents: number | null
  /** O orçamento definido nesta categoria (nulo quando ela não tem um só dela) */
  ownLimitCents: number | null
  spentCents: number
  /** Detalhamento do orçamento ("Salário Débora", "Salário Wilson") */
  items: BudgetItem[]
  children: BudgetLine[]
}

export type BudgetReport = {
  month: string
  /** Saídas (limites) e entradas (previsão) */
  expense: BudgetLine[]
  income: BudgetLine[]
}

/** Gastos por pessoa: quem lançou, no mês (pela data da compra) */
export type PersonTotal = {
  userId: string
  name: string
  image: string | null
  expenseCents: number
  incomeCents: number
  count: number
}
export type PeopleReport = { month: string; people: PersonTotal[] }

/*
 * Mês a mês por categoria (tabela cruzada, no estilo de um DRE gerencial):
 * as categorias nas linhas, os períodos nas colunas, e o total de cada linha.
 * `values` segue a ordem de `periods`.
 */
export const monthlyIntervals = ['month', 'quarter', 'year'] as const
export type MonthlyInterval = (typeof monthlyIntervals)[number]

/** Quantos meses cada coluna junta */
export const monthsPerInterval: Record<MonthlyInterval, number> = {
  month: 1,
  quarter: 3,
  year: 12,
}

export const monthlyReportQuerySchema = z.object({
  /** Primeiro mês da tabela ("2025-10") */
  start: monthSchema,
  /** Quantas colunas */
  count: z.coerce.number().int().min(1).max(36).default(12),
  interval: z.enum(monthlyIntervals).default('month'),
  /** Competência (data da compra) ou caixa (quando o dinheiro se move) */
  basis: z.enum(reportBases).default('accrual'),
})

/** Uma coluna: do mês `start` ao mês `end`, inclusive (iguais quando o intervalo é mensal) */
export type MonthlyPeriod = { start: string; end: string }

export type MonthlyChild = {
  categoryId: string
  name: string
  values: number[]
  totalCents: number
}

export type MonthlyRow = {
  /** Nulo = lançamentos sem categoria */
  categoryId: string | null
  name: string
  icon: CategoryIconName | null
  color: CategoryColor | null
  values: number[]
  totalCents: number
  children: MonthlyChild[]
}

export type MonthlySection = {
  rows: MonthlyRow[]
  /** Soma de todas as linhas em cada período */
  values: number[]
  totalCents: number
}

export type MonthlyReport = {
  interval: MonthlyInterval
  basis: ReportBasis
  periods: MonthlyPeriod[]
  income: MonthlySection
  expense: MonthlySection
}

/*
 * Evolução patrimonial: o saldo de cada conta ao **fim** de cada período, e o que sobra
 * quando se tira o que se deve. É a outra metade da história — o mês a mês mostra o que
 * entrou e saiu, este mostra o que ficou.
 *
 * Diferente dos relatórios por categoria, aqui a transferência **conta**: tirar dinheiro da
 * conta corrente e pôr na poupança não muda o patrimônio, mas muda o saldo das duas contas.
 * O saldo anda pela data em que o dinheiro se move (no cartão, o vencimento da fatura).
 */
export const netWorthQuerySchema = z.object({
  start: monthSchema,
  count: z.coerce.number().int().min(1).max(36).default(12),
  interval: z.enum(monthlyIntervals).default('month'),
})

export type NetWorthRow = {
  accountId: string
  name: string
  type: AccountType
  /** Saldo ao fim de cada período, na ordem de `periods` */
  values: number[]
}

export type NetWorthSide = {
  rows: NetWorthRow[]
  /** Soma das contas deste lado, período a período */
  values: number[]
}

export type NetWorthReport = {
  interval: MonthlyInterval
  periods: MonthlyPeriod[]
  /** O que se tem: conta corrente, poupança, dinheiro, investimento */
  assets: NetWorthSide
  /** O que se deve: a fatura em aberto de cada cartão, em valor positivo */
  liabilities: NetWorthSide
  /** Ativos menos passivos, ao fim de cada período */
  netValues: number[]
  /** Quanto o patrimônio mudou em relação ao período anterior */
  changeValues: number[]
}
