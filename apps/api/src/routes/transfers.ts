import { randomUUID } from 'node:crypto'
import { type Transaction, type TransferFormValues, transferFormSchema } from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { accounts, transactions } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notFound, notify, onInvalid } from '../http'
import { registrar } from '../lib/audit'
import { exigirSemProva, provasDe } from '../lib/reconciliation'
import { toTransaction } from './transactions'

/*
 * Transferência entre contas. Vira **dois lançamentos** com o mesmo `transferGroupId`: uma
 * saída na conta de origem e uma entrada na de destino. Assim cada conta enxerga o próprio
 * movimento, e o dinheiro não aparece nem some do grupo.
 *
 * Nenhuma das pernas tem categoria (nem uma parte sequer): é isso que as mantém fora dos
 * relatórios por categoria e do orçamento — trocar dinheiro de bolso não é gastar nem ganhar.
 */
export function transfersRoutes(deps: Deps) {
  const { db } = deps

  const assertAccounts = async (groupId: string, values: TransferFormValues) => {
    const ids = [values.fromAccountId, values.toAccountId]
    const rows = await db
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.groupId, groupId), inArray(accounts.id, ids)))
    if (rows.length !== 2) throw new HttpError(400, 'Conta não encontrada.', 'fromAccountId')
  }

  /** As duas pernas, prontas para inserir */
  const pernas = (
    groupId: string,
    userId: string,
    transferGroupId: string,
    values: TransferFormValues,
  ) => {
    const comum = {
      groupId,
      amountCents: values.amountCents,
      description: values.description,
      contactId: null,
      purchaseDate: values.date,
      paymentDate: values.date,
      transferGroupId,
      createdBy: userId,
    }
    return [
      { ...comum, type: 'expense' as const, accountId: values.fromAccountId },
      { ...comum, type: 'income' as const, accountId: values.toAccountId },
    ]
  }

  const carregar = async (groupId: string, transferGroupId: string) => {
    const rows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.groupId, groupId),
          isNull(transactions.deletedAt),
          eq(transactions.transferGroupId, transferGroupId),
        ),
      )
    if (rows.length === 0) throw notFound('Transferência')
    return rows
  }

  /** Devolve a perna de saída, que é como a tela mostra a transferência */
  const apresentar = (rows: (typeof transactions.$inferSelect)[], autor: string): Transaction => {
    const saida = rows.find((row) => row.type === 'expense') ?? rows[0]
    if (!saida) throw notFound('Transferência')
    const entrada = rows.find((row) => row.id !== saida.id)
    return toTransaction(saida, [], autor, entrada?.accountId ?? null)
  }

  return (
    new Hono<AppEnv>()
      .post('/', zValidator('json', transferFormSchema, onInvalid), async (c) => {
        const groupId = c.var.groupId
        const values = c.req.valid('json')
        await assertAccounts(groupId, values)

        const transferGroupId = randomUUID()
        const rows = await db
          .insert(transactions)
          .values(pernas(groupId, c.var.user.id, transferGroupId, values))
          .returning()

        for (const perna of rows) {
          await registrar(db, {
            groupId,
            entity: 'transaction',
            entityId: perna.id,
            action: 'create',
            actorId: c.var.user.id,
            label: perna.description || 'Transferência',
          })
        }
        notify(deps, c, 'transactions', 'accounts')
        return c.json(apresentar(rows, c.var.user.name), 201)
      })

      /*
       * Editar troca as duas pernas de uma vez, mantendo o mesmo id de transferência: mudar
       * conta, valor ou data tem que valer para os dois lados, senão o dinheiro se perde.
       */
      .patch('/:groupId', zValidator('json', transferFormSchema, onInvalid), async (c) => {
        const groupId = c.var.groupId
        const transferGroupId = c.req.param('groupId')
        const values = c.req.valid('json')
        await carregar(groupId, transferGroupId)
        await assertAccounts(groupId, values)

        const rows = await db.transaction(async (tx) => {
          await tx
            .delete(transactions)
            .where(
              and(
                eq(transactions.groupId, groupId),
                eq(transactions.transferGroupId, transferGroupId),
              ),
            )
          return tx
            .insert(transactions)
            .values(pernas(groupId, c.var.user.id, transferGroupId, values))
            .returning()
        })

        notify(deps, c, 'transactions', 'accounts')
        return c.json(apresentar(rows, c.var.user.name))
      })

      /*
       * Excluir marca as duas pernas: meia transferência não existe, nem na lixeira. Como
       * nada sai do banco, restaurar uma das pernas pela lixeira traz a outra junto.
       */
      .delete('/:groupId', async (c) => {
        // Conciliada com o banco, a transferência não se exclui: desfaz a conciliação antes
        const pernas = await carregar(c.var.groupId, c.req.param('groupId'))
        const provas = await provasDe(
          db,
          c.var.groupId,
          pernas.map((perna) => perna.id),
        )
        for (const perna of pernas) exigirSemProva(provas.get(perna.id) ?? [], 'excluir')

        const deleted = await db
          .update(transactions)
          .set({ deletedAt: new Date(), deletedBy: c.var.user.id, updatedAt: new Date() })
          .where(
            and(
              eq(transactions.groupId, c.var.groupId),
              isNull(transactions.deletedAt),
              eq(transactions.transferGroupId, c.req.param('groupId')),
            ),
          )
          .returning({ id: transactions.id, description: transactions.description })
        if (deleted.length === 0) throw notFound('Transferência')

        for (const perna of deleted) {
          await registrar(db, {
            groupId: c.var.groupId,
            entity: 'transaction',
            entityId: perna.id,
            action: 'delete',
            actorId: c.var.user.id,
            label: perna.description || 'Transferência',
          })
        }
        notify(deps, c, 'transactions', 'accounts')
        return c.body(null, 204)
      })
  )
}
