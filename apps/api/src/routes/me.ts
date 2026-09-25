import { type Me, updateProfileInputSchema } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { asc, count, eq, inArray } from 'drizzle-orm'
import { Hono } from 'hono'
import { member, organization, user } from '../db/schema'
import { type AppEnv, type Deps, onInvalid, toRole } from '../http'

// Quem está logado, o grupo ativo e os grupos de que participa
export function meRoutes(deps: Deps) {
  const { db } = deps

  const loadMe = async (userId: string, activeGroupId: string): Promise<Me> => {
    const [current] = await db.select().from(user).where(eq(user.id, userId)).limit(1)
    const groups = await db
      .select({ id: organization.id, name: organization.name, role: member.role })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt))
    /*
     * Quantas pessoas em cada orçamento. A tela de Orçamentos mostra isso em cada linha —
     * sem isso, os outros orçamentos apareceriam mudos, só com o nome.
     */
    const quantos = groups.length
      ? await db
          .select({ organizationId: member.organizationId, total: count() })
          .from(member)
          .where(
            inArray(
              member.organizationId,
              groups.map((group) => group.id),
            ),
          )
          .groupBy(member.organizationId)
      : []
    const pessoasPor = new Map(quantos.map((linha) => [linha.organizationId, linha.total]))

    const list = groups.map((group) => ({
      ...group,
      role: toRole(group.role),
      members: pessoasPor.get(group.id) ?? 1,
    }))
    return {
      user: {
        id: userId,
        name: current?.name ?? '',
        email: current?.email ?? '',
        image: current?.image ?? null,
      },
      activeGroup: list.find((group) => group.id === activeGroupId) ?? null,
      groups: list,
    }
  }

  return (
    new Hono<AppEnv>()
      .get('/', async (c) => c.json(await loadMe(c.var.user.id, c.var.groupId)))

      // Nome e foto. A foto chega já recortada e reduzida pelo navegador.
      .patch('/', zValidator('json', updateProfileInputSchema, onInvalid), async (c) => {
        const input = c.req.valid('json')
        await db
          .update(user)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.image !== undefined ? { image: input.image } : {}),
            updatedAt: new Date(),
          })
          .where(eq(user.id, c.var.user.id))
        // O nome e a foto aparecem para o grupo (ex.: autor dos lançamentos)
        deps.hub.publish(c.var.groupId, {
          type: 'invalidate',
          resources: ['group', 'transactions'],
          actorId: c.var.user.id,
        })
        return c.json(await loadMe(c.var.user.id, c.var.groupId))
      })
  )
}
