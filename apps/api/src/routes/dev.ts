import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import type { Deps } from '../http'
import { onInvalid } from '../http'

/*
 * Login de desenvolvimento: entra (ou cria a conta) só com nome e e-mail, sem Google/Apple/
 * Microsoft configurados. NUNCA é montado em produção (ver app.ts).
 */
const DEV_PASSWORD = 'bolso-dev-password'

const devSignInSchema = z.object({
  name: z.string().trim().min(1).max(60),
  email: z.email(),
})

export function devRoutes({ auth }: Deps) {
  return new Hono().post('/sign-in', zValidator('json', devSignInSchema, onInvalid), async (c) => {
    const { name, email } = c.req.valid('json')
    const headers = c.req.raw.headers
    const signIn = await auth.api.signInEmail({
      body: { email, password: DEV_PASSWORD },
      headers,
      asResponse: true,
    })
    if (signIn.ok) return signIn
    // Primeira vez: cria a conta (e o grupo pessoal, pelo gancho do auth.ts) e já entra
    return auth.api.signUpEmail({
      body: { name, email, password: DEV_PASSWORD },
      headers,
      asResponse: true,
    })
  })
}
