import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { configuredProviders } from './auth'
import {
  type AppEnv,
  type Deps,
  exigirEdicao,
  HttpError,
  isUniqueViolation,
  requireGroup,
} from './http'
import { accountsRoutes } from './routes/accounts'
import { apiKeysRoutes } from './routes/api-keys'
import { bankRoutes } from './routes/bank'
import { budgetsRoutes } from './routes/budgets'
import { categoriesRoutes } from './routes/categories'
import { contactsRoutes } from './routes/contacts'
import { devRoutes } from './routes/dev'
import { groupsRoutes } from './routes/groups'
import { importsRoutes } from './routes/imports'
import { integrationKeysRoutes } from './routes/integration-keys'
import { invitationsRoutes } from './routes/invitations'
import { meRoutes } from './routes/me'
import { reportsRoutes } from './routes/reports'
import { transactionsRoutes } from './routes/transactions'
import { transfersRoutes } from './routes/transfers'

/**
 * Monta a API (tudo em /api). Recebe as dependências prontas, o que deixa os testes usarem
 * um banco em memória. O WebSocket (/api/ws) é ligado em index.ts, que conhece o servidor HTTP.
 */
export function buildApp(deps: Deps) {
  const app = new Hono()

  if (deps.env.NODE_ENV === 'development') app.use('/api/*', logger())

  app.get('/api/health', (c) => c.json({ ok: true }))

  // Provedores de login prontos para uso: a tela de login mostra só os que funcionam
  app.get('/api/auth-providers', (c) => c.json(configuredProviders(deps.env)))

  // Login, sessão, grupos e convites do Better Auth
  app.on(['GET', 'POST'], '/api/auth/*', (c) => deps.auth.handler(c.req.raw))

  if (deps.env.NODE_ENV !== 'production') app.route('/api/dev', devRoutes(deps))

  // Daqui para baixo: exige login e grupo ativo, e tudo é filtrado pelo grupo
  const secured = new Hono<AppEnv>()
  secured.use('*', requireGroup(deps))
  // Quem a pessoa é e em qual orçamento está: vale igual para quem edita e para quem só vê
  secured.route('/me', meRoutes(deps))
  secured.route('/groups', groupsRoutes(deps))
  secured.route('/invitations', invitationsRoutes(deps))

  /*
   * Os dados do orçamento. Tudo aqui passa pela trava do "pode ver": ler é livre, gravar
   * depende do nível. Uma peneira só, para nenhuma rota nova nascer desprotegida.
   */
  const dados = new Hono<AppEnv>()
  dados.use('*', exigirEdicao())
  dados.route('/categories', categoriesRoutes(deps))
  dados.route('/accounts', accountsRoutes(deps))
  dados.route('/contacts', contactsRoutes(deps))
  dados.route('/integration-keys', integrationKeysRoutes(deps))
  dados.route('/api-keys', apiKeysRoutes(deps))
  dados.route('/bank', bankRoutes(deps))
  dados.route('/transactions', transactionsRoutes(deps))
  dados.route('/transfers', transfersRoutes(deps))
  dados.route('/budgets', budgetsRoutes(deps))
  dados.route('/reports', reportsRoutes(deps))
  dados.route('/imports', importsRoutes(deps))
  secured.route('/', dados)
  app.route('/api', secured)

  app.notFound((c) => c.json({ error: 'Endereço não encontrado.' }, 404))

  // Todos os erros saem no mesmo formato: { error, field? }
  app.onError((error, c) => {
    if (error instanceof HttpError) {
      return c.json({ error: error.message, field: error.field }, error.status)
    }
    // Duas pessoas criando o mesmo nome ao mesmo tempo: o índice único do banco segura
    if (isUniqueViolation(error)) {
      return c.json({ error: 'Já existe um item com esse nome.', field: 'name' }, 409)
    }
    console.error(error)
    return c.json({ error: 'Erro inesperado. Tente de novo.' }, 500)
  })

  return app
}
