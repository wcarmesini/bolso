import { randomBytes } from 'node:crypto'
import { API_KEY_PREFIX, type ApiKey, apiKeyFormSchema, type CreatedApiKey } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { apiKeys } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notFound, notify, onInvalid } from '../http'
import { hashApiKey } from '../lib/api-key'

/*
 * Chaves da API do Bolso: outro programa entrando no lugar da pessoa.
 *
 * A chave inteira existe por um instante, na resposta da criação. Depois fica só o hash —
 * nem quem abrir o banco consegue voltar atrás. Perdeu a chave, cria outra e apaga a velha.
 */

type Row = typeof apiKeys.$inferSelect

const toApiKey = (row: Row): ApiKey => ({
  id: row.id,
  name: row.name,
  scope: row.scope === 'write' ? 'write' : 'read',
  prefix: row.prefix,
  lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
})

export function apiKeysRoutes(deps: Deps) {
  const { db } = deps

  return new Hono<AppEnv>()
    .get('/', async (c) => {
      const rows = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.groupId, c.var.groupId))
        .orderBy(desc(apiKeys.createdAt))
      return c.json(rows.map(toApiKey))
    })

    .post('/', zValidator('json', apiKeyFormSchema, onInvalid), async (c) => {
      const values = c.req.valid('json')
      // 32 bytes de acaso: o bastante para ninguém adivinhar, curto o suficiente para copiar
      const token = `${API_KEY_PREFIX}${randomBytes(32).toString('base64url')}`
      const [created] = await db
        .insert(apiKeys)
        .values({
          groupId: c.var.groupId,
          name: values.name,
          scope: values.scope,
          prefix: token.slice(0, API_KEY_PREFIX.length + 6),
          tokenHash: hashApiKey(token),
          createdBy: c.var.user.id,
        })
        .returning()
      if (!created) throw new HttpError(500, 'Não foi possível criar a chave.')
      notify(deps, c, 'api-keys')
      const resposta: CreatedApiKey = { ...toApiKey(created), token }
      return c.json(resposta, 201)
    })

    .delete('/:id', async (c) => {
      const [deleted] = await db
        .delete(apiKeys)
        .where(and(eq(apiKeys.id, c.req.param('id')), eq(apiKeys.groupId, c.var.groupId)))
        .returning({ id: apiKeys.id })
      if (!deleted) throw notFound('Chave')
      notify(deps, c, 'api-keys')
      return c.body(null, 204)
    })
}
