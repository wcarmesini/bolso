import { z } from 'zod'

export const accountTypes = ['checking', 'savings', 'credit_card', 'cash', 'investment'] as const
export type AccountType = (typeof accountTypes)[number]

export const isAccountType = (value: unknown): value is AccountType =>
  typeof value === 'string' && accountTypes.some((type) => type === value)

export const accountTypeLabels: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  credit_card: 'Cartão de crédito',
  cash: 'Dinheiro',
  investment: 'Investimento',
}

// Cartão de crédito não tem saldo inicial: tem limite e um ciclo de fatura
export const hasInitialBalance = (type: AccountType) => type !== 'credit_card'
export const isCreditCard = (type: AccountType) => type === 'credit_card'

const day = z
  .number({ error: 'Informe o dia' })
  .int()
  .min(1, 'Use um dia de 1 a 31')
  .max(31, 'Use um dia de 1 a 31')

// Valores sempre em centavos inteiros (R$ 10,50 = 1050)
const accountFields = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(40, 'Use até 40 caracteres'),
  type: z.enum(accountTypes),
  initialBalanceCents: z.number().int().min(0).max(100_000_000_000),
  // Só cartão de crédito: dia em que a fatura fecha, dia em que vence e o limite
  closingDay: day.nullable(),
  dueDay: day.nullable(),
  limitCents: z.number().int().min(0).max(100_000_000_000).nullable(),
})

export const accountFormSchema = accountFields.superRefine((values, ctx) => {
  if (!isCreditCard(values.type)) return
  if (values.closingDay === null) {
    ctx.addIssue({ code: 'custom', path: ['closingDay'], message: 'Informe o dia do fechamento' })
  }
  if (values.dueDay === null) {
    ctx.addIssue({ code: 'custom', path: ['dueDay'], message: 'Informe o dia do vencimento' })
  }
})
export type AccountFormValues = z.infer<typeof accountFormSchema>

export const accountSchema = accountFields.extend({
  id: z.string(),
  createdAt: z.string(),
})
export type Account = z.infer<typeof accountSchema>

/** Ciclo da fatura, quando a conta é um cartão com fechamento e vencimento definidos */
export function cardCycleOf(account: Pick<Account, 'type' | 'closingDay' | 'dueDay'>) {
  if (!isCreditCard(account.type) || account.closingDay === null || account.dueDay === null) {
    return null
  }
  return { closingDay: account.closingDay, dueDay: account.dueDay }
}
