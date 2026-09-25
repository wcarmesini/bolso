import {
  type Category,
  categoryFormSchema,
  createCategoryInputSchema,
  isCategoryIcon,
  nameKey,
  reorderCategoriesSchema,
  subcategoryFormSchema,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, eq, inArray, isNull, max, ne, notInArray } from 'drizzle-orm'
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
  icon: isCategoryIcon(row.icon) ? row.icon : null,
  color: row.color,
  position: row.position,
  createdAt: row.createdAt.toISOString(),
})

const duplicateTop = () => new HttpError(409, 'Já existe uma categoria com esse nome.', 'name')

export function categoriesRoutes(deps: Deps) {
  const { db } = deps

  /** Categoria nova entra no fim da lista em que aparece (um tipo, ou dentro de uma principal) */
  const nextPosition = async (
    groupId: string,
    where: { kind?: (typeof categories.$inferSelect)['kind']; parentId?: string },
  ) => {
    const [row] = await db
      .select({ maior: max(categories.position) })
      .from(categories)
      .where(
        and(
          eq(categories.groupId, groupId),
          where.parentId ? eq(categories.parentId, where.parentId) : isNull(categories.parentId),
          where.kind ? eq(categories.kind, where.kind) : undefined,
        ),
      )
    return (row?.maior ?? 0) + 1
  }

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
        /*
         * Manda a ordem que a pessoa arrastou. Empate (categorias criadas antes da ordenação
         * existir) cai no nome, comparado em português para "Água" vir antes de "Banco".
         */
        const sorted = rows.sort(
          (a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'),
        )
        return c.json(sorted.map(toCategory))
      })

      /*
       * Nova ordem de uma lista arrastada. Recebe os ids na ordem final e grava a posição de
       * cada um; quem não veio na lista (outro tipo, outra principal) não é tocado.
       */
      .put('/order', zValidator('json', reorderCategoriesSchema, onInvalid), async (c) => {
        const groupId = c.var.groupId
        const { ids, parentId } = c.req.valid('json')
        const rows = await db
          .select()
          .from(categories)
          .where(and(eq(categories.groupId, groupId), inArray(categories.id, ids)))
        if (rows.length !== ids.length) throw notFound('Categoria')

        /*
         * Arrastar uma subcategoria para outra principal: além da ordem, ela troca de mãe (e
         * de tipo, se a nova for de receita). Nome repetido no destino não entra — a regra é
         * a mesma de criar uma subcategoria lá.
         */
        let mae: (typeof rows)[number] | undefined
        if (parentId) {
          const [encontrada] = await db
            .select()
            .from(categories)
            .where(and(eq(categories.id, parentId), eq(categories.groupId, groupId)))
            .limit(1)
          if (!encontrada || encontrada.parentId) {
            throw new HttpError(400, 'Categoria principal não encontrada.', 'parentId')
          }
          if (ids.includes(parentId)) {
            throw new HttpError(400, 'Uma categoria não pode entrar dentro dela mesma.', 'parentId')
          }
          mae = encontrada

          const mudando = rows.filter((row) => row.parentId !== parentId)

          /*
           * Uma principal só vira subcategoria se estiver vazia: o app tem **um nível só**, e
           * aceitar isso criaria uma neta que nenhuma tela sabe mostrar.
           */
          const virandoFilha = mudando.filter((row) => !row.parentId)
          if (virandoFilha.length > 0) {
            const netas = await db
              .select({ parentId: categories.parentId, name: categories.name })
              .from(categories)
              .where(
                inArray(
                  categories.parentId,
                  virandoFilha.map((row) => row.id),
                ),
              )
            const comFilhas = virandoFilha.find((row) =>
              netas.some((neta) => neta.parentId === row.id),
            )
            if (comFilhas) {
              throw new HttpError(
                400,
                `“${comFilhas.name}” tem subcategorias dentro dela. Mova ou apague as subcategorias antes.`,
                'parentId',
              )
            }
          }
          if (mudando.length > 0) {
            const jaLa = await db
              .select({ nameKey: categories.nameKey })
              .from(categories)
              .where(and(eq(categories.parentId, parentId), notInArray(categories.id, ids)))
            // Conta também as que estão vindo na mesma leva: duas "Feira" não cabem juntas
            const ocupados = new Map<string, number>()
            for (const item of [...jaLa, ...rows]) {
              ocupados.set(item.nameKey, (ocupados.get(item.nameKey) ?? 0) + 1)
            }
            const repetida = mudando.find((row) => (ocupados.get(row.nameKey) ?? 0) > 1)
            if (repetida) {
              throw new HttpError(
                409,
                `“${encontrada.name}” já tem uma subcategoria chamada “${repetida.name}”.`,
                'name',
              )
            }
          }
        }

        await db.transaction(async (tx) => {
          for (const [index, id] of ids.entries()) {
            await tx
              .update(categories)
              .set({
                position: index + 1,
                ...(mae ? { parentId: mae.id, kind: mae.kind } : {}),
                updatedAt: new Date(),
              })
              .where(eq(categories.id, id))
          }
        })
        // Mudar de mãe muda a leitura dos relatórios e do orçamento daquela categoria
        notify(deps, c, 'categories')
        return c.body(null, 204)
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
              position: await nextPosition(groupId, { parentId: parent.id }),
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
          .values({
            ...values,
            groupId,
            nameKey: key,
            position: await nextPosition(groupId, { kind: values.kind }),
          })
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
