import {
  type Category,
  categoryFormSchema,
  createCategoryInputSchema,
  nameKey,
  subcategoryFormSchema,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { categories } from '../db/schema'
import {
  type AppEnv,
  type Deps,
  HttpError,
  notFound,
  notify,
  onInvalid,
  parseOrThrow,
} from '../http'

type Row = typeof categories.$inferSelect

const toCategory = (row: Row): Category => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  parentId: row.parentId,
  icon: row.icon,
  color: row.color,
  createdAt: row.createdAt.toISOString(),
})

const duplicateTop = () => new HttpError(409, 'Já existe uma categoria com esse nome.', 'name')

export function categoriesRoutes(deps: Deps) {
  const { db } = deps

  const findInGroup = async (id: string, groupId: string) => {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), eq(categories.groupId, groupId)))
      .limit(1)
    return row
  }

  return (
    new Hono<AppEnv>()
      .get('/', async (c) => {
        const rows = await db.select().from(categories).where(eq(categories.groupId, c.var.groupId))
        // Ordena no código para respeitar acentos em português ("Água" antes de "Banco")
        const sorted = rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        return c.json(sorted.map(toCategory))
      })

      .post('/', zValidator('json', createCategoryInputSchema, onInvalid), async (c) => {
        const input = c.req.valid('json')
        const groupId = c.var.groupId
        const key = nameKey(input.name)

        // Subcategoria: fica dentro de uma principal do mesmo grupo e herda o tipo dela
        if ('parentId' in input && input.parentId) {
          const parent = await findInGroup(input.parentId, groupId)
          if (!parent || parent.parentId) {
            throw new HttpError(400, 'Categoria principal não encontrada.', 'parentId')
          }
          const [sibling] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.parentId, parent.id), eq(categories.nameKey, key)))
            .limit(1)
          if (sibling) {
            throw new HttpError(
              409,
              `“${parent.name}” já tem uma subcategoria com esse nome.`,
              'name',
            )
          }
          const [created] = await db
            .insert(categories)
            .values({
              groupId,
              parentId: parent.id,
              kind: parent.kind,
              name: input.name,
              nameKey: key,
            })
            .returning()
          if (!created) throw new HttpError(500, 'Não foi possível criar a subcategoria.')
          notify(deps, c, 'categories')
          return c.json(toCategory(created), 201)
        }

        const values = parseOrThrow(categoryFormSchema, input)
        const [duplicate] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.groupId, groupId),
              eq(categories.kind, values.kind),
              isNull(categories.parentId),
              eq(categories.nameKey, key),
            ),
          )
          .limit(1)
        if (duplicate) throw duplicateTop()

        const [created] = await db
          .insert(categories)
          .values({ ...values, groupId, nameKey: key })
          .returning()
        if (!created) throw new HttpError(500, 'Não foi possível criar a categoria.')
        notify(deps, c, 'categories')
        return c.json(toCategory(created), 201)
      })

      .patch('/:id', async (c) => {
        const groupId = c.var.groupId
        const current = await findInGroup(c.req.param('id'), groupId)
        if (!current) throw notFound('Categoria')
        const body: unknown = await c.req.json().catch(() => null)

        // Subcategoria: só o nome muda
        if (current.parentId) {
          const { name } = parseOrThrow(subcategoryFormSchema, body)
          const key = nameKey(name)
          const [sibling] = await db
            .select({ id: categories.id })
            .from(categories)
            .where(
              and(
                eq(categories.parentId, current.parentId),
                eq(categories.nameKey, key),
                ne(categories.id, current.id),
              ),
            )
            .limit(1)
          if (sibling)
            throw new HttpError(409, 'Já existe uma subcategoria com esse nome aqui.', 'name')
          const [updated] = await db
            .update(categories)
            .set({ name, nameKey: key, updatedAt: new Date() })
            .where(eq(categories.id, current.id))
            .returning()
          if (!updated) throw notFound('Categoria')
          notify(deps, c, 'categories')
          return c.json(toCategory(updated))
        }

        const values = parseOrThrow(categoryFormSchema, body)
        const key = nameKey(values.name)
        const [duplicate] = await db
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.groupId, groupId),
              eq(categories.kind, values.kind),
              isNull(categories.parentId),
              eq(categories.nameKey, key),
              ne(categories.id, current.id),
            ),
          )
          .limit(1)
        if (duplicate) throw duplicateTop()

        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(categories)
            .set({ ...values, nameKey: key, updatedAt: new Date() })
            .where(eq(categories.id, current.id))
            .returning()
          // Mudar a principal de despesa para receita leva as subcategorias junto
          if (values.kind !== current.kind) {
            await tx
              .update(categories)
              .set({ kind: values.kind, updatedAt: new Date() })
              .where(eq(categories.parentId, current.id))
          }
          return row
        })
        if (!updated) throw notFound('Categoria')
        notify(deps, c, 'categories')
        return c.json(toCategory(updated))
      })

      // Excluir uma principal exclui as subcategorias (FK em cascata); lançamentos ficam sem categoria
      .delete('/:id', async (c) => {
        const [deleted] = await db
          .delete(categories)
          .where(and(eq(categories.id, c.req.param('id')), eq(categories.groupId, c.var.groupId)))
          .returning({ id: categories.id })
        if (!deleted) throw notFound('Categoria')
        notify(deps, c, 'categories', 'transactions', 'budgets')
        return c.body(null, 204)
      })
  )
}
