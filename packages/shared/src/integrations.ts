import { z } from 'zod'

export const integrationProviders = [
  'pluggy',
  'belvo',
  'openai',
  'anthropic',
  'gemini',
  'other',
] as const
export type IntegrationProvider = (typeof integrationProviders)[number]

export const isIntegrationProvider = (value: unknown): value is IntegrationProvider =>
  typeof value === 'string' && integrationProviders.some((provider) => provider === value)

export const providerMeta: Record<IntegrationProvider, { label: string; category: string }> = {
  pluggy: { label: 'Pluggy', category: 'Open Finance' },
  belvo: { label: 'Belvo', category: 'Open Finance' },
  openai: { label: 'OpenAI', category: 'Inteligência artificial' },
  anthropic: { label: 'Anthropic (Claude)', category: 'Inteligência artificial' },
  gemini: { label: 'Google Gemini', category: 'Inteligência artificial' },
  other: { label: 'Outro serviço', category: 'Outro' },
}

export const integrationKeyFormSchema = z
  .object({
    provider: z.enum(integrationProviders),
    customProvider: z.string().trim().max(40, 'Use até 40 caracteres'),
    label: z.string().trim().max(40, 'Use até 40 caracteres'),
    secret: z
      .string()
      .trim()
      .min(8, 'A chave parece curta demais')
      .max(500, 'A chave parece longa demais'),
  })
  .superRefine((values, context) => {
    if (values.provider === 'other' && !values.customProvider) {
      context.addIssue({ code: 'custom', path: ['customProvider'], message: 'Informe o serviço' })
    }
  })
export type IntegrationKeyFormValues = z.infer<typeof integrationKeyFormSchema>

// A API nunca devolve a chave inteira: só os 4 últimos caracteres
export const integrationKeySchema = z.object({
  id: z.string(),
  provider: z.enum(integrationProviders),
  customProvider: z.string(),
  label: z.string(),
  secretLast4: z.string(),
  createdAt: z.string(),
})
export type IntegrationKey = z.infer<typeof integrationKeySchema>

export function providerName(key: Pick<IntegrationKey, 'provider' | 'customProvider'>) {
  return key.provider === 'other' ? key.customProvider : providerMeta[key.provider].label
}

export function maskSecret(key: Pick<IntegrationKey, 'secretLast4'>) {
  return `••••${key.secretLast4}`
}
