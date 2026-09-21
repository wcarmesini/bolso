import { z } from 'zod'

export const transactionTypes = ['expense', 'income'] as const
export type TransactionType = (typeof transactionTypes)[number]

export const isTransactionType = (value: unknown): value is TransactionType =>
  value === 'expense' || value === 'income'

// No singular: aqui se fala de um lançamento (em Categorias, os rótulos são no plural)
export const transactionTypeLabels: Record<TransactionType, string> = {
  expense: 'Despesa',
  income: 'Receita',
}

export const MAX_INSTALLMENTS = 48
export const MAX_SPLITS = 10

const cents = z.number().int().max(100_000_000_000)

// Filtro por mês: "2026-09"
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido (use AAAA-MM)')

/**
 * Uma parte do lançamento: quanto dele vai para qual categoria. Um lançamento comum tem uma
 * parte só; "desmembrar" é ter várias. Relatórios e orçamento somam sempre as partes.
 */
export const transactionSplitSchema = z.object({
  categoryId: z.uuid().nullable(),
  amountCents: cents.min(1, 'Informe o valor'),
})
export type TransactionSplit = z.infer<typeof transactionSplitSchema>

/*
 * Lançamento. Valor sempre positivo em centavos; o tipo diz se é entrada ou saída.
 * Duas datas: a da compra (competência — em que mês o gasto "conta" no orçamento)
 * e a do pagamento (caixa — quando o dinheiro sai). No cartão de crédito, a do pagamento
 * é calculada pela API: é o vencimento da fatura em que a compra caiu.
 */
const transactionFields = z.object({
  type: z.enum(transactionTypes),
  amountCents: cents.min(1, 'Informe um valor'),
  description: z.string().trim().max(120, 'Use até 120 caracteres'),
  accountId: z.uuid().nullable(),
  purchaseDate: z.iso.date('Data inválida'),
  paymentDate: z.iso.date('Data inválida').nullable(),
  splits: z
    .array(transactionSplitSchema)
    .min(1, 'Informe a categoria')
    .max(MAX_SPLITS, `Divida em até ${MAX_SPLITS} categorias`),
  // Só vale ao criar: 10 = dez lançamentos ligados, um por mês, somando o valor total
  installments: z
    .number()
    .int()
    .min(1)
    .max(MAX_INSTALLMENTS, `Até ${MAX_INSTALLMENTS} parcelas`)
    .default(1),
})

export const transactionFormSchema = transactionFields.superRefine((values, ctx) => {
  const sum = values.splits.reduce((total, split) => total + split.amountCents, 0)
  if (sum !== values.amountCents) {
    ctx.addIssue({
      code: 'custom',
      path: ['splits'],
      message: 'A soma das categorias precisa dar o valor total',
    })
  }
  const keys = values.splits.map((split) => split.categoryId ?? 'sem-categoria')
  if (new Set(keys).size !== keys.length) {
    ctx.addIssue({ code: 'custom', path: ['splits'], message: 'Categoria repetida na divisão' })
  }
})
export type TransactionFormValues = z.input<typeof transactionFormSchema>
export type TransactionInput = z.output<typeof transactionFormSchema>

export const transactionSchema = transactionFields.omit({ installments: true }).extend({
  id: z.string(),
  // Fatura em que caiu (mês do vencimento), só para cartão de crédito
  statementMonth: z.string().nullable(),
  // Parcela "3 de 10" de uma compra parcelada; nulo = lançamento avulso
  installment: z.object({ groupId: z.string(), number: z.number(), count: z.number() }).nullable(),
  createdBy: z.string(),
  createdByName: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type Transaction = z.infer<typeof transactionSchema>

export const transactionListQuerySchema = z.object({
  month: monthSchema.optional(),
  accountId: z.uuid().optional(),
  // "statement": a fatura do cartão (accountId) que vence no mês, em vez das compras do mês
  view: z.enum(['month', 'statement']).default('month'),
})

// Parcelas: editar vale para uma ou para a série; excluir pode ser uma, esta e as próximas, ou todas
export const editScopes = ['one', 'all'] as const
export type EditScope = (typeof editScopes)[number]
export const deleteScopes = ['one', 'following', 'all'] as const
export type DeleteScope = (typeof deleteScopes)[number]

export const editScopeQuerySchema = z.object({ scope: z.enum(editScopes).default('one') })
export const deleteScopeQuerySchema = z.object({ scope: z.enum(deleteScopes).default('one') })
