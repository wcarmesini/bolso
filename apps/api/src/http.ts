import { API_KEY_PREFIX, type GroupRole, type RealtimeResource } from '@bolso/shared'
import { eq } from 'drizzle-orm'
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { z } from 'zod'
import type { Auth } from './auth'
import type { Database } from './db/client'
import { apiKeys, session, user as userTable } from './db/schema'
import type { Env } from './env'
import { findMembership, firstMembership } from './groups'
import { hashApiKey } from './lib/api-key'
import type { RealtimeHub } from './realtime/hub'

export type Deps = { db: Database; auth: Auth; hub: RealtimeHub; env: Env }

export type CurrentUser = { id: string; name: string; email: string; image: string | null }

export type AppEnv = {
  Variables: {
    user: CurrentUser
    sessionId: string
    groupId: string
    role: GroupRole
  }
}

/**
 * Erro com status e mensagem para a pessoa. Formato de resposta: { error, field? }.
 * `field` indica que o problema é de um campo do formulário (ex.: nome repetido).
 */
export class HttpError extends Error {
  readonly status: ContentfulStatusCode
  readonly field: string | undefined

  constructor(status: ContentfulStatusCode, message: string, field?: string) {
    super(message)
    this.status = status
    this.field = field
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} não encontrada.`)

// Só o que a resposta de erro precisa saber do Zod (o formato interno muda entre versões)
type ValidationIssue = { message: string; path: PropertyKey[] }
type ValidationResult = { success: true } | { success: false; error: { issues: ValidationIssue[] } }

// Resposta padrão quando o corpo ou a query não passam na validação (Zod)
export function onInvalid(result: ValidationResult, c: Context) {
  if (result.success) return
  const issue = result.error.issues[0]
  const field = issue && issue.path.length > 0 ? String(issue.path[0]) : undefined
  return c.json({ error: issue?.message ?? 'Dados inválidos.', field }, 400)
}

export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const issue = result.error.issues[0]
    const field = issue && issue.path.length > 0 ? String(issue.path[0]) : undefined
    throw new HttpError(400, issue?.message ?? 'Dados inválidos.', field)
  }
  return result.data
}

// Postgres avisa violação de índice único com o código 23505 (o Drizzle embrulha o erro)
export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  if ('code' in error && error.code === '23505') return true
  return 'cause' in error && isUniqueViolation(error.cause)
}

/**
 * Exige sessão válida e um grupo ativo do qual a pessoa ainda participa.
 * Se o grupo ativo da sessão não vale mais (ex.: saiu dele), volta para o primeiro grupo dela.
 */
export function requireGroup({ auth, db }: Deps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (await porChaveDaApi(db, c)) return next()

    const result = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!result) throw new HttpError(401, 'Faça login para continuar.')

    const { user, session: current } = result
    let membership = current.activeOrganizationId
      ? await findMembership(db, user.id, current.activeOrganizationId)
      : undefined

    if (!membership) {
      membership = await firstMembership(db, user.id)
      if (!membership) throw new HttpError(403, 'Você não participa de nenhum grupo.')
      await db
        .update(session)
        .set({ activeOrganizationId: membership.organizationId })
        .where(eq(session.id, current.id))
    }

    c.set('user', { id: user.id, name: user.name, email: user.email, image: user.image ?? null })
    c.set('sessionId', current.id)
    c.set('groupId', membership.organizationId)
    c.set('role', toRole(membership.role))
    await next()
  })
}

/*
 * Entrada por chave da API: `Authorization: Bearer bolso_...`.
 *
 * A chave pertence a um grupo e carrega o nome de quem a criou — é essa pessoa que aparece
 * como autora do que a chave fizer. Uma chave de leitura não passa de GET: barrar aqui vale
 * mais que confiar em cada rota lembrar de checar.
 */
async function porChaveDaApi(db: Database, c: Context<AppEnv>) {
  const cabecalho = c.req.header('Authorization') ?? ''
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : ''
  if (!token.startsWith(API_KEY_PREFIX)) return false

  const [chave] = await db
    .select({
      id: apiKeys.id,
      groupId: apiKeys.groupId,
      scope: apiKeys.scope,
      userId: apiKeys.createdBy,
      name: userTable.name,
      email: userTable.email,
      image: userTable.image,
    })
    .from(apiKeys)
    .innerJoin(userTable, eq(userTable.id, apiKeys.createdBy))
    .where(eq(apiKeys.tokenHash, hashApiKey(token)))
    .limit(1)
  if (!chave) throw new HttpError(401, 'Chave de API inválida.')

  if (chave.scope !== 'write' && c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    throw new HttpError(403, 'Esta chave é somente de leitura.')
  }

  // Marca o uso sem segurar a resposta: serve para a pessoa ver qual chave ainda trabalha
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, chave.id))
    .catch(() => {})

  c.set('user', {
    id: chave.userId,
    name: chave.name,
    email: chave.email,
    image: chave.image ?? null,
  })
  c.set('sessionId', `api-key:${chave.id}`)
  c.set('groupId', chave.groupId)
  c.set('role', 'member')
  return true
}

export function toRole(role: string): GroupRole {
  return role === 'owner' || role === 'admin' ? role : 'member'
}

// Avisa, em tempo real, todos do grupo que estes dados mudaram
export function notify(deps: Deps, c: Context<AppEnv>, ...resources: RealtimeResource[]) {
  deps.hub.publish(c.var.groupId, { type: 'invalidate', resources, actorId: c.var.user.id })
}
