import { z } from 'zod'

/*
 * Configuração da API, vinda de variáveis de ambiente (arquivo .env em desenvolvimento).
 * Fora de produção, os segredos têm valores de desenvolvimento para tudo funcionar sem
 * configurar nada. Em produção eles são obrigatórios: a API não sobe sem eles.
 */
const devDefaults = {
  BETTER_AUTH_SECRET: 'dev-secret-somente-para-desenvolvimento-nao-usar-em-producao',
  ENCRYPTION_KEY: '0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a69788796a5b4c3d2e1f0',
}

const optional = z
  .string()
  .optional()
  .transform((value) => value || undefined)

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3000),
  // Sem DATABASE_URL, usa o PGlite (Postgres embutido) gravando em PGLITE_DIR
  DATABASE_URL: optional,
  PGLITE_DIR: z.string().default('.data/pglite'),
  // Endereço público do app. Web e API ficam no mesmo domínio: a API atende em /api
  PUBLIC_URL: z.url().default('http://localhost:5173'),
  // Outros endereços aceitos (ex.: o preview do Vite), separados por vírgula
  TRUSTED_ORIGINS: z
    .string()
    .default('http://localhost:4173,http://localhost:4174')
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET precisa de 32+ caracteres'),
  // 32 bytes em hexadecimal (64 caracteres): criptografa as chaves de serviços externos
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, 'ENCRYPTION_KEY: 64 caracteres hexadecimais'),
  // Login social: cada provedor só é ativado quando as duas variáveis dele existem
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  APPLE_CLIENT_ID: optional,
  APPLE_CLIENT_SECRET: optional,
  MICROSOFT_CLIENT_ID: optional,
  MICROSOFT_CLIENT_SECRET: optional,
})

export type Env = z.infer<typeof envSchema>

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const isProduction = source.NODE_ENV === 'production'
  const parsed = envSchema.safeParse({ ...(isProduction ? {} : devDefaults), ...source })
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `- ${issue.path.join('.')}: ${issue.message}`,
    )
    throw new Error(`Configuração inválida da API:\n${problems.join('\n')}`)
  }
  return parsed.data
}
