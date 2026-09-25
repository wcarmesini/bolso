import { createServer } from 'node:net'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { buildApp } from './app'
import { createAuth } from './auth'
import { createDatabase } from './db/client'
import { loadEnv } from './env'
import { iniciarBuscaAutomatica } from './lib/bank-sync'
import { RealtimeHub } from './realtime/hub'
import { realtimeSocket } from './realtime/socket'

// Em desenvolvimento, lê apps/api/.env se existir (opcional: sem ele, valem os padrões de dev)
try {
  process.loadEnvFile('.env')
} catch {
  // Sem .env
}

const env = loadEnv()

/** A porta está livre? Testa abrindo e fechando um servidor nela. */
function portIsFree(port: number) {
  return new Promise<boolean>((resolve) => {
    const probe = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => probe.close(() => resolve(true)))
      .listen(port)
  })
}

// Outra API já está rodando (ex.: dois `pnpm dev` abertos): esta sai ANTES de abrir o banco.
// O PGlite não aceita dois processos na mesma pasta: os dois juntos corrompem o banco.
if (!(await portIsFree(env.PORT))) {
  console.error(
    `Já existe uma API na porta ${env.PORT}; esta não vai abrir o banco. ` +
      'Feche o outro `pnpm dev` (Ctrl+C) antes de rodar de novo.',
  )
  process.exit(1)
}

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

// O banco conectado busca sozinho: o que chega fica esperando aprovação, nada entra direto
const pararBusca = iniciarBuscaAutomatica(deps)

// Encerra com calma (Ctrl+C, deploy): fecha o servidor e o banco
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    pararBusca()
    server.close()
    void close().finally(() => process.exit(0))
  })
}
