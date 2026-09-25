import { type IntegrationKey, integrationKeyFormSchema } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { integrationKeys } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notFound, notify, onInvalid } from '../http'
import { encryptSecret } from '../lib/crypto'

type Row = typeof integrationKeys.$inferSelect

// Nunca devolve a chave: só os 4 últimos caracteres
const toIntegrationKey = (row: Row): IntegrationKey => ({
  id: row.id,
  provider: row.provider,
  customProvider: row.customProvider,
  label: row.label,
  clientId: row.clientId,
  secretLast4: row.secretLast4,
  createdAt: row.createdAt.toISOString(),
})

export function integrationKeysRoutes(deps: Deps) {
  const { db, env } = deps

  return new Hono<AppEnv>()
    .get('/', async (c) => {
      const rows = await db
        .select()
        .from(integrationKeys)
        .where(eq(integrationKeys.groupId, c.var.groupId))
        .orderBy(desc(integrationKeys.createdAt))
      return c.json(rows.map(toIntegrationKey))
    })

    .post('/', zValidator('json', integrationKeyFormSchema, onInvalid), async (c) => {
      const values = c.req.valid('json')
      const [created] = await db
        .insert(integrationKeys)
        .values({
          groupId: c.var.groupId,
          provider: values.provider,
          customProvider: values.provider === 'other' ? values.customProvider : '',
          label: values.label,
          clientId: values.clientId,
          secretCiphertext: encryptSecret(values.secret, env.ENCRYPTION_KEY),
          secretLast4: values.secret.slice(-4),
          createdBy: c.var.user.id,
        })
        .returning()
      if (!created) throw new HttpError(500, 'Não foi possível salvar a chave.')
      notify(deps, c, 'integration-keys')
      return c.json(toIntegrationKey(created), 201)
    })

    .delete('/:id', async (c) => {
      const [deleted] = await db
        .delete(integrationKeys)
        .where(
          and(
            eq(integrationKeys.id, c.req.param('id')),
            eq(integrationKeys.groupId, c.var.groupId),
          ),
        )
        .returning({ id: integrationKeys.id })
      if (!deleted) throw notFound('Chave')
      notify(deps, c, 'integration-keys')
      return c.body(null, 204)
    })
}
