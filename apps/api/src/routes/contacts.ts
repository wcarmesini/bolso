import { type Contact, contactFormSchema, nameKey } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { contacts } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notFound, notify, onInvalid } from '../http'

type Row = typeof contacts.$inferSelect

const toContact = (row: Row): Contact => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  document: row.document,
  notes: row.notes,
  createdAt: row.createdAt.toISOString(),
})

const duplicate = () => new HttpError(409, 'Já existe um contato com esse nome.', 'name')

export function contactsRoutes(deps: Deps) {
  const { db } = deps

  const assertUnique = async (groupId: string, key: string, ignoreId?: string) => {
    const [row] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.groupId, groupId),
          eq(contacts.nameKey, key),
          ignoreId ? ne(contacts.id, ignoreId) : undefined,
        ),
      )
      .limit(1)
    if (row) throw duplicate()
  }

  return (
    new Hono<AppEnv>()
      .get('/', async (c) => {
        const rows = await db.select().from(contacts).where(eq(contacts.groupId, c.var.groupId))
        return c.json(rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(toContact))
      })

      .post('/', zValidator('json', contactFormSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const key = nameKey(values.name)
        await assertUnique(c.var.groupId, key)
        const [created] = await db
          .insert(contacts)
          .values({ ...values, groupId: c.var.groupId, nameKey: key })
          .returning()
        if (!created) throw new HttpError(500, 'Não foi possível criar o contato.')
        notify(deps, c, 'contacts')
        return c.json(toContact(created), 201)
      })

      .patch('/:id', zValidator('json', contactFormSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const id = c.req.param('id')
        const key = nameKey(values.name)
        await assertUnique(c.var.groupId, key, id)
        const [updated] = await db
          .update(contacts)
          .set({ ...values, nameKey: key, updatedAt: new Date() })
          .where(and(eq(contacts.id, id), eq(contacts.groupId, c.var.groupId)))
          .returning()
        if (!updated) throw notFound('Contato')
        notify(deps, c, 'contacts')
        return c.json(toContact(updated))
      })

      // Lançamentos do contato excluído ficam sem contato (FK "set null")
      .delete('/:id', async (c) => {
        const [deleted] = await db
          .delete(contacts)
          .where(and(eq(contacts.id, c.req.param('id')), eq(contacts.groupId, c.var.groupId)))
          .returning({ id: contacts.id })
        if (!deleted) throw notFound('Contato')
        notify(deps, c, 'contacts', 'transactions')
        return c.body(null, 204)
      })
  )
}
