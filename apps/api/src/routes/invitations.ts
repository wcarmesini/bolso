import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { withAuthErrors } from '../auth-errors'
import { invitation, organization, user } from '../db/schema'
import { type AppEnv, type Deps, HttpError } from '../http'

// Quem abre o link do convite: vê de qual grupo é e aceita
export function invitationsRoutes(deps: Deps) {
  const { db, auth, hub } = deps

  return (
    new Hono<AppEnv>()
      .get('/:id', async (c) => {
        const [row] = await db
          .select({
            id: invitation.id,
            email: invitation.email,
            status: invitation.status,
            expiresAt: invitation.expiresAt,
            groupName: organization.name,
            inviterName: user.name,
          })
          .from(invitation)
          .innerJoin(organization, eq(organization.id, invitation.organizationId))
          .innerJoin(user, eq(user.id, invitation.inviterId))
          .where(eq(invitation.id, c.req.param('id')))
          .limit(1)
        if (!row) throw new HttpError(404, 'Convite não encontrado.')
        return c.json({
          id: row.id,
          email: row.email,
          groupName: row.groupName,
          inviterName: row.inviterName,
          available: row.status === 'pending' && row.expiresAt > new Date(),
          forYou: row.email.toLowerCase() === c.var.user.email.toLowerCase(),
        })
      })

      // Aceitar entra no grupo e já o torna o grupo ativo (o Better Auth faz isso)
      .post('/:id/accept', async (c) => {
        const accepted = await withAuthErrors(
          () =>
            auth.api.acceptInvitation({
              headers: c.req.raw.headers,
              body: { invitationId: c.req.param('id') },
            }),
          'Não foi possível aceitar o convite.',
        )
        if (!accepted) throw new HttpError(400, 'Não foi possível aceitar o convite.')
        const groupId = accepted.invitation.organizationId
        // Quem já está no grupo vê a pessoa nova entrar
        hub.publish(groupId, { type: 'invalidate', resources: ['group'], actorId: c.var.user.id })
        return c.json({ groupId })
      })
  )
}
