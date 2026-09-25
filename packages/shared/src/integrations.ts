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

/** Serviços que pedem duas partes: um identificador público e a chave secreta */
export const needsClientId = (provider: IntegrationProvider) =>
  provider === 'pluggy' || provider === 'belvo'

export const integrationKeyFormSchema = z
  .object({
    provider: z.enum(integrationProviders),
    customProvider: z.string().trim().max(40, 'Use até 40 caracteres'),
    label: z.string().trim().max(40, 'Use até 40 caracteres'),
    /** Só nos serviços de Open Finance: o Client ID, que não é segredo */
    clientId: z.string().trim().max(120, 'Use até 120 caracteres').default(''),
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
    if (needsClientId(values.provider) && !values.clientId) {
      context.addIssue({ code: 'custom', path: ['clientId'], message: 'Informe o Client ID' })
    }
  })
export type IntegrationKeyFormValues = z.infer<typeof integrationKeyFormSchema>
/** O que o formulário carrega antes do schema preencher os padrões (clientId nasce vazio) */
export type IntegrationKeyFormInput = z.input<typeof integrationKeyFormSchema>

// A API nunca devolve a chave inteira: só os 4 últimos caracteres
export const integrationKeySchema = z.object({
  id: z.string(),
  provider: z.enum(integrationProviders),
  customProvider: z.string(),
  label: z.string(),
  clientId: z.string(),
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
