import type { AuthProviderId } from '@bolso/shared'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import type { Database } from './db/client'
import * as schema from './db/schema'
import type { Env } from './env'
import { createPersonalGroup, firstMembership } from './groups'

type SocialProviders = NonNullable<Parameters<typeof betterAuth>[0]['socialProviders']>

/** Cada provedor só entra quando as duas variáveis dele existem (ver apps/api/.env.example) */
function socialProvidersFrom(env: Env): SocialProviders {
  const socialProviders: SocialProviders = {}
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    }
  }
  if (env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET) {
    socialProviders.apple = { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET }
  }
  if (env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET) {
    socialProviders.microsoft = {
      clientId: env.MICROSOFT_CLIENT_ID,
      clientSecret: env.MICROSOFT_CLIENT_SECRET,
      tenantId: 'common',
    }
  }
  return socialProviders
}

/** Provedores prontos para uso. A tela de login mostra só estes, em vez de falhar no clique. */
export function configuredProviders(env: Env): AuthProviderId[] {
  return Object.keys(socialProvidersFrom(env)) as AuthProviderId[]
}

// Mantenha os plugins iguais aos de scripts/auth-schema.config.ts (eles definem as tabelas)
export function createAuth(db: Database, env: Env) {
  const socialProviders = socialProvidersFrom(env)

  return betterAuth({
    appName: 'Bolso',
    baseURL: env.PUBLIC_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.PUBLIC_URL, ...env.TRUSTED_ORIGINS],
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    socialProviders,
    // E-mail e senha só para o login de desenvolvimento (/api/dev/sign-in); desligado em produção
    emailAndPassword: { enabled: env.NODE_ENV !== 'production' },
    account: {
      accountLinking: {
        enabled: true,
        // Quem entra com o Google e já tinha conta com o mesmo e-mail cai na mesma conta,
        // em vez de criar uma segunda. O Google confirma o e-mail, então dá para confiar.
        trustedProviders: ['google'],
      },
    },
    // Se o provedor recusar (a pessoa cancelou, por exemplo), ela volta para a nossa tela
    // de login com ?error=..., e não para a página de erro crua do Better Auth
    onAPIError: { errorURL: `${env.PUBLIC_URL}/entrar` },
    plugins: [
      organization({
        creatorRole: 'owner',
        // Sem serviço de e-mail ainda: o convite é compartilhado como link (ver routes/groups.ts)
        sendInvitationEmail: async () => {},
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          // Todo mundo começa com o próprio grupo, já com as categorias iniciais
          after: async (user) => {
            await createPersonalGroup(db, user.id)
          },
        },
      },
      session: {
        create: {
          // Toda sessão nova já abre no grupo da pessoa
          before: async (session) => {
            const membership = await firstMembership(db, session.userId)
            return {
              data: { ...session, activeOrganizationId: membership?.organizationId ?? null },
            }
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
