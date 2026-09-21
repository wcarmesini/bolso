/*
 * Usado só para gerar src/db/schema/auth.ts com o CLI do Better Auth:
 *   pnpm dlx @better-auth/cli generate --config scripts/auth-schema.config.ts --output src/db/schema/auth.ts
 * Precisa ter os mesmos plugins de src/auth.ts, porque são eles que definem as tabelas.
 */
import { PGlite } from '@electric-sql/pglite'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { organization } from 'better-auth/plugins'
import { drizzle } from 'drizzle-orm/pglite'

export const auth = betterAuth({
  database: drizzleAdapter(drizzle(new PGlite()), { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
})
