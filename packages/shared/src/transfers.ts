import { z } from 'zod'

/*
 * Transferência entre contas: dinheiro que sai de uma conta e entra em outra, sem ser receita
 * nem despesa. No banco são **dois lançamentos** ligados pelo mesmo `transferGroupId` — uma
 * saída na origem e uma entrada no destino —, para o saldo de cada conta continuar certo.
 *
 * Por não ser gasto nem ganho, transferência fica **de fora** do orçamento e dos relatórios:
 * senão trocar dinheiro de bolso pareceria gastar e receber no mesmo dia.
 */
const cents = z
  .number({ error: 'Informe um valor' })
  .int()
  .min(0)
  .max(100_000_000_000, 'Valor muito alto')

export const transferFormSchema = z
  .object({
    fromAccountId: z.uuid('Escolha de onde o dinheiro sai'),
    toAccountId: z.uuid('Escolha para onde o dinheiro vai'),
    amountCents: cents.min(1, 'Informe um valor'),
    date: z.iso.date('Data inválida'),
    description: z.string().trim().max(120, 'Use até 120 caracteres'),
  })
  .refine((values) => values.fromAccountId !== values.toAccountId, {
    message: 'As duas contas precisam ser diferentes',
    path: ['toAccountId'],
  })
export type TransferFormValues = z.infer<typeof transferFormSchema>

/** O que um lançamento carrega quando é uma perna de transferência */
export const transferInfoSchema = z.object({
  groupId: z.string(),
  /** A outra ponta: para onde foi, ou de onde veio */
  counterpartAccountId: z.string().nullable(),
})
export type TransferInfo = z.infer<typeof transferInfoSchema>
