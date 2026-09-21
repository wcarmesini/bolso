import {
  type Account,
  type AccountFormValues,
  accountFormSchema,
  cardCycleOf,
  hasInitialBalance,
  isCreditCard,
  nameKey,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, eq, ne } from 'drizzle-orm'
import { Hono } from 'hono'
import { accounts } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notFound, notify, onInvalid } from '../http'
import { refreshOpenStatements } from '../statements'

type Row = typeof accounts.$inferSelect

const toAccount = (row: Row): Account => ({
  id: row.id,
  name: row.name,
  type: row.type,
  initialBalanceCents: row.initialBalanceCents,
  closingDay: row.closingDay,
  dueDay: row.dueDay,
  limitCents: row.limitCents,
  createdAt: row.createdAt.toISOString(),
})

// Cada tipo guarda só o que faz sentido para ele: cartão tem ciclo e limite, e não tem saldo
const normalize = (values: AccountFormValues) => {
  const card = isCreditCard(values.type)
  return {
    name: values.name,
    type: values.type,
    initialBalanceCents: hasInitialBalance(values.type) ? values.initialBalanceCents : 0,
    closingDay: card ? values.closingDay : null,
    dueDay: card ? values.dueDay : null,
    limitCents: card ? values.limitCents : null,
  }
}

const duplicate = () => new HttpError(409, 'Já existe uma conta com esse nome.', 'name')

export function accountsRoutes(deps: Deps) {
  const { db } = deps

  const assertUnique = async (groupId: string, key: string, ignoreId?: string) => {
    const [row] = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.groupId, groupId),
          eq(accounts.nameKey, key),
          ignoreId ? ne(accounts.id, ignoreId) : undefined,
        ),
      )
      .limit(1)
    if (row) throw duplicate()
  }

  return (
    new Hono<AppEnv>()
      .get('/', async (c) => {
        const rows = await db.select().from(accounts).where(eq(accounts.groupId, c.var.groupId))
        return c.json(rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')).map(toAccount))
      })

      .post('/', zValidator('json', accountFormSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const key = nameKey(values.name)
        await assertUnique(c.var.groupId, key)
        const [created] = await db
          .insert(accounts)
          .values({ ...normalize(values), groupId: c.var.groupId, nameKey: key })
          .returning()
        if (!created) throw new HttpError(500, 'Não foi possível criar a conta.')
        notify(deps, c, 'accounts')
        return c.json(toAccount(created), 201)
      })

      .patch('/:id', zValidator('json', accountFormSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const id = c.req.param('id')
        const key = nameKey(values.name)
        await assertUnique(c.var.groupId, key, id)
        const [before] = await db
          .select()
          .from(accounts)
          .where(and(eq(accounts.id, id), eq(accounts.groupId, c.var.groupId)))
          .limit(1)
        if (!before) throw notFound('Conta')

        const [updated] = await db
          .update(accounts)
          .set({ ...normalize(values), nameKey: key, updatedAt: new Date() })
          .where(eq(accounts.id, id))
          .returning()
        if (!updated) throw notFound('Conta')

        // Mudou o fechamento ou o vencimento: as faturas abertas se reorganizam
        const cycleBefore = cardCycleOf(before)
        const cycleAfter = cardCycleOf(updated)
        const cycleChanged =
          cycleBefore?.closingDay !== cycleAfter?.closingDay ||
          cycleBefore?.dueDay !== cycleAfter?.dueDay
        if (cycleChanged) {
          await refreshOpenStatements(db, id, cycleAfter)
          notify(deps, c, 'accounts', 'transactions')
        } else {
          notify(deps, c, 'accounts')
        }
        return c.json(toAccount(updated))
      })

      // Lançamentos da conta excluída ficam sem conta (FK "set null")
      .delete('/:id', async (c) => {
        const [deleted] = await db
          .delete(accounts)
          .where(and(eq(accounts.id, c.req.param('id')), eq(accounts.groupId, c.var.groupId)))
          .returning({ id: accounts.id })
        if (!deleted) throw notFound('Conta')
        notify(deps, c, 'accounts', 'transactions')
        return c.body(null, 204)
      })
  )
}
