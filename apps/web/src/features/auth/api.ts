import type { AuthProviderId } from '@bolso/shared'
import { api } from '@/lib/api-client'
import { authClient } from '@/lib/auth-client'

/** O provedor existe no código, mas o servidor não tem as chaves dele (ver apps/api/.env.example). */
export class ProviderNotConfiguredError extends Error {}

/** Quais provedores o servidor tem configurados agora */
export function listAuthProviders() {
  return api<AuthProviderId[]>('/auth-providers')
}

/**
 * Entra com uma conta externa: leva a pessoa à tela do provedor e a traz de volta logada,
 * já na página que ela tentou abrir. Se o provedor recusar, ela volta para /entrar.
 */
export async function signInWithProvider(provider: AuthProviderId, continueTo: string) {
  const { error } = await authClient.signIn.social({
    provider,
    callbackURL: continueTo,
    errorCallbackURL: '/entrar',
  })
  if (!error) return
  const notConfigured = error.status === 400 || error.status === 404
  throw notConfigured
    ? new ProviderNotConfiguredError(error.message ?? '')
    : new Error(error.message ?? 'Não foi possível entrar.')
}

/**
 * Encerra a sessão no servidor. O cliente do Better Auth não lança erro, devolve { error }:
 * sem conferir, uma saída recusada pareceria ter dado certo e a pessoa continuaria logada.
 */
export async function signOut() {
  const { error } = await authClient.signOut()
  if (error) throw new Error('Não foi possível sair. Tente de novo.')
}
