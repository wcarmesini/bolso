import { buildApp } from '../src/app'
import { createAuth } from '../src/auth'
import { createDatabase } from '../src/db/client'
import { loadEnv } from '../src/env'
import { RealtimeHub } from '../src/realtime/hub'

/** Sobe uma API completa com banco PGlite em memória (cada teste começa do zero). */
export async function createTestApi() {
  const env = loadEnv({ NODE_ENV: 'test', PUBLIC_URL: 'http://localhost:5173' })
  const { db, close } = await createDatabase({ kind: 'pglite' })
  const auth = createAuth(db, env)
  const hub = new RealtimeHub()
  const app = buildApp({ db, auth, hub, env })

  /** Entra (criando a conta na primeira vez) e devolve o cookie da sessão. */
  async function signIn(name: string, email: string) {
    const response = await app.request('/api/dev/sign-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, email }),
    })
    if (!response.ok) throw new Error(`Login falhou: ${response.status} ${await response.text()}`)
    const cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ')
    return {
      cookie,
      request: (path: string, init: RequestInit = {}) =>
        app.request(path, {
          ...init,
          headers: { 'content-type': 'application/json', cookie, ...init.headers },
        }),
      json: async <T>(path: string, init: RequestInit = {}) => {
        const result = await app.request(path, {
          ...init,
          headers: { 'content-type': 'application/json', cookie, ...init.headers },
        })
        return { status: result.status, body: (await result.json()) as T }
      },
    }
  }

  return { app, db, auth, hub, env, signIn, close }
}

export type TestApi = Awaited<ReturnType<typeof createTestApi>>
export type TestUser = Awaited<ReturnType<TestApi['signIn']>>

/** Coleta os avisos de tempo real enviados a um grupo. */
export function listen(hub: RealtimeHub, groupId: string) {
  const received: unknown[] = []
  const unsubscribe = hub.subscribe(groupId, { send: (data) => received.push(JSON.parse(data)) })
  return { received, unsubscribe }
}
