/*
 * Provedores de login. A lista vive aqui para o front e a API falarem dos mesmos nomes:
 * a API diz quais estão configurados, e a tela de login mostra só esses.
 */
export const authProviderIds = ['google', 'apple', 'microsoft'] as const
export type AuthProviderId = (typeof authProviderIds)[number]

export const isAuthProviderId = (value: unknown): value is AuthProviderId =>
  authProviderIds.includes(value as AuthProviderId)
