import { z } from 'zod'

export const accountTypes = [
  'checking',
  'savings',
  'cash',
  'investment',
  'credit_card',
  /*
   * Dinheiro emprestado. São dois tipos porque ficam em lados opostos do balanço: o que
   * emprestei é meu (entra no que eu tenho), o que me emprestaram é dívida (entra no que eu
   * devo). Um tipo só teria de mudar de lado conforme o saldo, e a tabela ficaria pulando.
   */
  'loan',
  'debt',
] as const
export type AccountType = (typeof accountTypes)[number]

export const isAccountType = (value: unknown): value is AccountType =>
  typeof value === 'string' && accountTypes.some((type) => type === value)

export const accountTypeLabels: Record<AccountType, string> = {
  checking: 'Conta corrente',
  savings: 'Poupança',
  cash: 'Dinheiro',
  investment: 'Investimento',
  credit_card: 'Cartão de crédito',
  loan: 'Empréstimo a receber',
  debt: 'Empréstimo a pagar',
}

/** O título de cada grupo na lista de contas (português não faz plural por regra única) */
export const accountTypePlurals: Record<AccountType, string> = {
  checking: 'Contas correntes',
  savings: 'Poupanças',
  cash: 'Dinheiro',
  investment: 'Investimentos',
  credit_card: 'Cartões de crédito',
  loan: 'Empréstimos a receber',
  debt: 'Empréstimos a pagar',
}

/** A explicação que aparece ao escolher o tipo */
export const accountTypeHints: Record<AccountType, string> = {
  checking: 'Conta no banco, com saldo.',
  savings: 'Reserva que rende.',
  cash: 'O que está na carteira.',
  investment: 'Aplicações, corretora.',
  credit_card: 'Compra agora, paga na fatura.',
  loan: 'Dinheiro que você emprestou e vai receber de volta.',
  debt: 'Dinheiro que emprestaram a você e você vai devolver.',
}

/** O que soma a favor no patrimônio; o resto é dívida */
export const isLiability = (type: AccountType) => type === 'credit_card' || type === 'debt'

/*
 * Cartão de crédito não tem saldo inicial: tem limite e um ciclo de fatura. O resto começa
 * com um valor — inclusive o empréstimo, cujo saldo inicial é quanto foi emprestado.
 */
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
  /*
   * Pode ser negativo: uma conta no cheque especial começa no vermelho, e um empréstimo a
   * pagar é uma conta cujo saldo é a dívida — ela anda para zero conforme se devolve.
   */
  initialBalanceCents: z.number().int().min(-100_000_000_000).max(100_000_000_000),
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
