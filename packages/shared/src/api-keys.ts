import { z } from 'zod'

/*
 * Chaves da API do Bolso: é o contrário da Integração.
 *
 * Numa integração, o Bolso usa a chave de outro serviço. Aqui, outro programa usa a chave do
 * Bolso — uma planilha, um robô, um assistente. A chave aparece inteira uma vez só, na hora
 * de criar; depois fica guardada só o resumo dela (hash), que serve para conferir e não para
 * recuperar. Perdeu, cria outra.
 */

export const apiKeyScopes = ['read', 'write'] as const
export type ApiKeyScope = (typeof apiKeyScopes)[number]

export const apiKeyScopeLabels: Record<ApiKeyScope, string> = {
  read: 'Somente leitura',
  write: 'Leitura e escrita',
}

export const apiKeyScopeHints: Record<ApiKeyScope, string> = {
  read: 'Consulta lançamentos, relatórios e cadastros. Não muda nada.',
  write: 'Pode criar, editar e apagar, como se fosse você.',
}

export const apiKeyFormSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à chave').max(40, 'Use até 40 caracteres'),
  scope: z.enum(apiKeyScopes),
})
export type ApiKeyFormValues = z.infer<typeof apiKeyFormSchema>

export type ApiKey = {
  id: string
  name: string
  scope: ApiKeyScope
  /** Começo da chave, o bastante para reconhecer qual é sem revelar o resto */
  prefix: string
  lastUsedAt: string | null
  createdAt: string
}

/** Só na criação: a única vez em que a chave inteira sai do servidor */
export type CreatedApiKey = ApiKey & { token: string }

export const API_KEY_PREFIX = 'bolso_'
