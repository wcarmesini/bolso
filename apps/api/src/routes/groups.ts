import { randomUUID } from 'node:crypto'
import { createGroupInputSchema, type GroupMember, inviteInputSchema } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, asc, eq, gt } from 'drizzle-orm'
import { Hono } from 'hono'
import { withAuthErrors } from '../auth-errors'
import { invitation, member, organization, user } from '../db/schema'
import { seedDefaultCategories } from '../groups'
import { type AppEnv, type Deps, HttpError, notify, onInvalid, toRole } from '../http'

export function groupsRoutes(deps: Deps) {
  const { db, auth, env } = deps

  const requireManager = (role: string) => {
    if (role !== 'owner' && role !== 'admin') {
      throw new HttpError(403, 'Só quem administra o orçamento pode fazer isso.')
    }
  }

  return (
    new Hono<AppEnv>()
      .get('/current/members', async (c) => {
        const rows = await db
          .select({
            id: member.id,
            userId: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: member.role,
          })
          .from(member)
          .innerJoin(user, eq(user.id, member.userId))
          .where(eq(member.organizationId, c.var.groupId))
          .orderBy(asc(member.createdAt))
        const members: GroupMember[] = rows.map((row) => ({ ...row, role: toRole(row.role) }))
        return c.json(members)
      })

      .patch('/current', zValidator('json', createGroupInputSchema, onInvalid), async (c) => {
        requireManager(c.var.role)
        const { name } = c.req.valid('json')
        await db.update(organization).set({ name }).where(eq(organization.id, c.var.groupId))
        notify(deps, c, 'group')
        return c.json({ id: c.var.groupId, name })
      })

      // Convites pendentes (ainda não aceitos e dentro do prazo)
      .get('/current/invitations', async (c) => {
        const rows = await db
          .select({ id: invitation.id, email: invitation.email, expiresAt: invitation.expiresAt })
          .from(invitation)
          .where(
            and(
              eq(invitation.organizationId, c.var.groupId),
              eq(invitation.status, 'pending'),
              gt(invitation.expiresAt, new Date()),
            ),
          )
        return c.json(
          rows.map((row) => ({
            id: row.id,
            email: row.email,
            expiresAt: row.expiresAt.toISOString(),
            link: `${env.PUBLIC_URL}/convite/${row.id}`,
          })),
        )
      })

      // Sem serviço de e-mail ainda: o convite vira um link para compartilhar (WhatsApp etc.)
      .post('/current/invitations', zValidator('json', inviteInputSchema, onInvalid), async (c) => {
        const { email } = c.req.valid('json')
        const created = await withAuthErrors(
          () =>
            auth.api.createInvitation({
              headers: c.req.raw.headers,
              body: { email, role: 'member', organizationId: c.var.groupId },
            }),
          'Não foi possível criar o convite.',
        )
        notify(deps, c, 'group')
        return c.json(
          { id: created.id, email: created.email, link: `${env.PUBLIC_URL}/convite/${created.id}` },
          201,
        )
      })

      // Novo grupo (ex.: um para a casa, outro para a viagem). Vira o grupo ativo.
      .post('/', zValidator('json', createGroupInputSchema, onInvalid), async (c) => {
        const { name } = c.req.valid('json')
        const created = await withAuthErrors(
          () =>
            auth.api.createOrganization({
              headers: c.req.raw.headers,
              body: { name, slug: `bolso-${randomUUID()}` },
            }),
          'Não foi possível criar o orçamento.',
        )
        if (!created) throw new HttpError(500, 'Não foi possível criar o orçamento.')
        await seedDefaultCategories(db, created.id)
        return c.json({ id: created.id, name: created.name }, 201)
      })

      .post('/:id/activate', async (c) => {
        const organizationId = c.req.param('id')
        await withAuthErrors(
          () =>
            auth.api.setActiveOrganization({
              headers: c.req.raw.headers,
              body: { organizationId },
            }),
          'Não foi possível trocar de grupo.',
        )
        return c.json({ id: organizationId })
      })
  )
}
