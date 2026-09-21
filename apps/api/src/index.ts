import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { buildApp } from './app'
import { createAuth } from './auth'
import { createDatabase } from './db/client'
import { loadEnv } from './env'
import { RealtimeHub } from './realtime/hub'
import { realtimeSocket } from './realtime/socket'

// Em desenvolvimento, lê apps/api/.env se existir (opcional: sem ele, valem os padrões de dev)
try {
  process.loadEnvFile('.env')
} catch {
  // Sem .env
}

const env = loadEnv()
const { db, close } = await createDatabase(
  env.DATABASE_URL
    ? { kind: 'postgres', url: env.DATABASE_URL }
    : { kind: 'pglite', dataDir: env.PGLITE_DIR },
)
const auth = createAuth(db, env)
const hub = new RealtimeHub()
const deps = { db, auth, hub, env }

const app = buildApp(deps)
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })
app.get(
  '/api/ws',
  upgradeWebSocket((c) => realtimeSocket(deps, c)),
)

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  const database = env.DATABASE_URL ? 'PostgreSQL' : `PGlite (${env.PGLITE_DIR})`
  console.info(`API do Bolso em http://localhost:${info.port} · banco: ${database}`)
})
injectWebSocket(server)

// Encerra com calma (Ctrl+C, deploy): fecha o servidor e o banco
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close()
    void close().finally(() => process.exit(0))
  })
}
