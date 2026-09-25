import { randomUUID } from 'node:crypto'
import {
  createGroupInputSchema,
  type GroupContents,
  type GroupMember,
  inviteInputSchema,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, asc, count, eq, gt, isNull, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { withAuthErrors } from '../auth-errors'
import {
  accounts,
  categories,
  invitation,
  member,
  organization,
  session,
  transactions,
  user,
} from '../db/schema'
import { createPersonalGroup, firstMembership, seedDefaultCategories } from '../groups'
import { type AppEnv, type Deps, HttpError, notify, onInvalid, toRole } from '../http'

export function groupsRoutes(deps: Deps) {
  const { db, auth, env } = deps

  /*
   * Um orçamento da própria pessoa, pelo id.
   *
   * Quem não participa recebe 404 e não 403: de fora, um orçamento alheio simplesmente não
   * existe — nem o nome, nem a confirmação de que aquele id é de alguma coisa.
   */
  const meuOrcamento = async (userId: string, groupId: string) => {
    const [row] = await db
      .select({ id: organization.id, name: organization.name, role: member.role })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(and(eq(member.userId, userId), eq(member.organizationId, groupId)))
      .limit(1)
    if (!row) throw new HttpError(404, 'Orçamento não encontrado.')
    return row
  }

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

      /*
       * O que tem dentro de um orçamento.
       *
       * Serve à confirmação de exclusão, então vale para qualquer orçamento da pessoa e não só
       * para o que está em uso — excluir um orçamento parado é justamente o caso comum.
       */
      .get('/:id/contents', async (c) => {
        const alvo = await meuOrcamento(c.var.user.id, c.req.param('id'))
        const quantos = async (query: Promise<{ n: number }[]>) => (await query)[0]?.n ?? 0
        const contents: GroupContents = {
          id: alvo.id,
          name: alvo.name,
          people: await quantos(
            db.select({ n: count() }).from(member).where(eq(member.organizationId, alvo.id)),
          ),
          accounts: await quantos(
            db.select({ n: count() }).from(accounts).where(eq(accounts.groupId, alvo.id)),
          ),
          categories: await quantos(
            db.select({ n: count() }).from(categories).where(eq(categories.groupId, alvo.id)),
          ),
          // Só os que a pessoa vê: os excluídos também somem, mas ninguém os conta como perda
          transactions: await quantos(
            db
              .select({ n: count() })
              .from(transactions)
              .where(and(eq(transactions.groupId, alvo.id), isNull(transactions.deletedAt))),
          ),
        }
        return c.json(contents)
      })

      /*
       * Excluir um orçamento inteiro.
       *
       * Este é o único lugar do Bolso onde algo sai do banco de verdade: as tabelas penduradas
       * em `organization` caem por cascade, junto com quem participava e os convites. Não há
       * lixeira para isto, e é por isso que a tela pede o nome escrito à mão antes de chamar.
       *
       * Dois freios: só o dono exclui, e ninguém fica sem orçamento nenhum — a pessoa precisa
       * ter outro para onde ir, que passa a ser o em uso.
       */
      .delete('/:id', async (c) => {
        const alvo = await meuOrcamento(c.var.user.id, c.req.param('id'))
        if (toRole(alvo.role) !== 'owner') {
          throw new HttpError(403, 'Só quem é dono do orçamento pode excluí-lo.')
        }

        const [proximo] = await db
          .select({ organizationId: member.organizationId })
          .from(member)
          .where(and(eq(member.userId, c.var.user.id), ne(member.organizationId, alvo.id)))
          .orderBy(asc(member.createdAt))
          .limit(1)
        if (!proximo) {
          throw new HttpError(
            400,
            'Este é o seu único orçamento. Crie outro antes de excluir este.',
          )
        }

        const acompanhados = await db
          .select({ userId: member.userId })
          .from(member)
          .where(and(eq(member.organizationId, alvo.id), ne(member.userId, c.var.user.id)))

        await db.delete(organization).where(eq(organization.id, alvo.id))
        await db
          .update(session)
          .set({ activeOrganizationId: proximo.organizationId })
          .where(eq(session.id, c.var.sessionId))

        /*
         * Quem participava junto perde o acesso — mas não pode ficar sem orçamento nenhum, senão
         * a API passa a recusar tudo e a pessoa fica presa numa tela de erro. Quem sobrar sem
         * nada ganha o próprio, igual ao do primeiro login.
         */
        for (const { userId } of acompanhados) {
          if (!(await firstMembership(db, userId))) await createPersonalGroup(db, userId)
        }

        // Quem estava dentro junto precisa sair da tela; as outras sessões se ajeitam sozinhas
        deps.hub.publish(alvo.id, {
          type: 'invalidate',
          resources: ['group'],
          actorId: c.var.user.id,
        })
        return c.json({ id: alvo.id, activeGroupId: proximo.organizationId })
      })
  )
}
