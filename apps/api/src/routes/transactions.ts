import { randomUUID } from 'node:crypto'
import {
  deleteScopeQuerySchema,
  editScopeQuerySchema,
  monthRange,
  prorate,
  splitInstallments,
  type Transaction,
  type TransactionInput,
  type TransactionSplit,
  transactionFormSchema,
  transactionListQuerySchema,
} from '@bolso/shared'
import { zValidator } from '@hono/zod-validator'
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { categories, contacts, transactionSplits, transactions, user } from '../db/schema'
import { type AppEnv, type Deps, HttpError, notify, onInvalid } from '../http'
import { diferencas, historicoDe, registrar } from '../lib/audit'
import { accountCycle, cashFields } from '../statements'

type Row = typeof transactions.$inferSelect
// Dentro de db.transaction(), o "tx" tem a mesma cara do banco
type Executor = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>

export const toTransaction = (
  row: Row,
  splits: TransactionSplit[],
  createdByName: string,
  /** A outra perna, quando este lançamento faz parte de uma transferência */
  counterpartAccountId: string | null = null,
): Transaction => ({
  id: row.id,
  type: row.type,
  amountCents: row.amountCents,
  description: row.description,
  accountId: row.accountId,
  contactId: row.contactId,
  origin: row.origin,
  externalId: row.externalId,
  purchaseDate: row.purchaseDate,
  paymentDate: row.paymentDate,
  splits,
  statementMonth: row.statementMonth,
  transfer: row.transferGroupId ? { groupId: row.transferGroupId, counterpartAccountId } : null,
  installment:
    row.installmentGroupId && row.installmentNumber && row.installmentCount
      ? {
          groupId: row.installmentGroupId,
          number: row.installmentNumber,
          count: row.installmentCount,
        }
      : null,
  createdBy: row.createdBy,
  createdByName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** As categorias das partes precisam ser do grupo e do mesmo tipo do lançamento */
async function assertSplitCategories(db: Executor, groupId: string, values: TransactionInput) {
  const ids = values.splits.flatMap((split) => (split.categoryId ? [split.categoryId] : []))
  if (ids.length === 0) return
  const found = await db
    .select({ id: categories.id, kind: categories.kind })
    .from(categories)
    .where(and(inArray(categories.id, ids), eq(categories.groupId, groupId)))
  if (found.length !== new Set(ids).size) {
    throw new HttpError(400, 'Categoria não encontrada.', 'splits')
  }
  if (found.some((category) => category.kind !== values.type)) {
    const expected = values.type === 'expense' ? 'despesa' : 'receita'
    throw new HttpError(400, `Escolha categorias de ${expected}.`, 'splits')
  }
}

/** O contato precisa ser do grupo */
async function assertContact(db: Executor, groupId: string, contactId: string | null) {
  if (!contactId) return
  const [contact] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), eq(contacts.groupId, groupId)))
    .limit(1)
  if (!contact) throw new HttpError(400, 'Contato não encontrado.', 'contactId')
}

/** Mesmas categorias, na mesma proporção, para outro valor (ex.: cada parcela) */
function splitsFor(amountCents: number, splits: TransactionSplit[]): TransactionSplit[] {
  const amounts = prorate(
    amountCents,
    splits.map((split) => split.amountCents),
  )
  return splits
    .map((split, index) => ({ categoryId: split.categoryId, amountCents: amounts[index] ?? 0 }))
    .filter((split) => split.amountCents > 0)
}

async function replaceSplits(
  db: Executor,
  groupId: string,
  transactionId: string,
  splits: TransactionSplit[],
) {
  await db.delete(transactionSplits).where(eq(transactionSplits.transactionId, transactionId))
  await db
    .insert(transactionSplits)
    .values(splits.map((split) => ({ ...split, groupId, transactionId })))
}

export function transactionsRoutes(deps: Deps) {
  const { db } = deps

  /** Junta as partes e o nome de quem lançou a cada linha */
  const present = async (rows: Row[]) => {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const splitRows = await db
      .select()
      .from(transactionSplits)
      .where(inArray(transactionSplits.transactionId, ids))
      .orderBy(desc(transactionSplits.amountCents))
    const splitsById = new Map<string, TransactionSplit[]>()
    for (const split of splitRows) {
      const list = splitsById.get(split.transactionId) ?? []
      list.push({ categoryId: split.categoryId, amountCents: split.amountCents })
      splitsById.set(split.transactionId, list)
    }
    const authorIds = [...new Set(rows.map((row) => row.createdBy))]
    const authors = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, authorIds))
    const nameById = new Map(authors.map((author) => [author.id, author.name]))

    /*
     * Transferência: a tela precisa saber a outra ponta ("saiu para o Nubank"), e a outra
     * perna pode não estar nesta lista — quando se filtra por conta, só uma delas aparece.
     */
    const transferIds = [
      ...new Set(rows.flatMap((row) => (row.transferGroupId ? [row.transferGroupId] : []))),
    ]
    const outraPonta = new Map<string, string | null>()
    if (transferIds.length > 0) {
      const pernas = await db
        .select({
          id: transactions.id,
          accountId: transactions.accountId,
          transferGroupId: transactions.transferGroupId,
        })
        .from(transactions)
        .where(inArray(transactions.transferGroupId, transferIds))
      for (const perna of pernas) {
        for (const outra of pernas) {
          if (outra.transferGroupId === perna.transferGroupId && outra.id !== perna.id) {
            outraPonta.set(perna.id, outra.accountId)
          }
        }
      }
    }

    return rows.map((row) =>
      toTransaction(
        row,
        splitsById.get(row.id) ?? [],
        nameById.get(row.createdBy) ?? '',
        outraPonta.get(row.id) ?? null,
      ),
    )
  }

  /** Lançamentos que têm ao menos uma parte na categoria pedida (ou sem categoria nenhuma) */
  const splitCondition = async (
    groupId: string,
    categoryId: string | undefined,
    uncategorized: boolean,
  ) => {
    if (uncategorized) {
      return inArray(
        transactions.id,
        db
          .select({ id: transactionSplits.transactionId })
          .from(transactionSplits)
          .where(isNull(transactionSplits.categoryId)),
      )
    }
    if (!categoryId) return undefined
    const filhas = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.groupId, groupId), eq(categories.parentId, categoryId)))
    const ids = [categoryId, ...filhas.map((child) => child.id)]
    return inArray(
      transactions.id,
      db
        .select({ id: transactionSplits.transactionId })
        .from(transactionSplits)
        .where(inArray(transactionSplits.categoryId, ids)),
    )
  }

  /*
   * Excluir não apaga: marca `deleted_at`. Todo lugar que lê lançamento precisa deste filtro
   * — é por isso que ele mora aqui, com nome, em vez de ser repetido solto por aí.
   */
  const naoExcluido = isNull(transactions.deletedAt)

  const findOwn = async (groupId: string, id: string) => {
    const [row] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.groupId, groupId), naoExcluido))
      .limit(1)
    if (!row) throw new HttpError(404, 'Lançamento não encontrado.')
    return row
  }

  return (
    new Hono<AppEnv>()
      .get('/', zValidator('query', transactionListQuerySchema, onInvalid), async (c) => {
        const { month, accountId, view, from, to, categoryId, uncategorized, type, basis } =
          c.req.valid('query')
        const groupId = c.var.groupId
        const groupFilter = and(eq(transactions.groupId, groupId), naoExcluido)
        // Caixa lê o dia em que o dinheiro se move; competência, a data da compra
        const date =
          basis === 'cash'
            ? sql`coalesce(${transactions.paymentDate}, ${transactions.purchaseDate})`
            : sql`${transactions.purchaseDate}`

        let where: ReturnType<typeof and>
        if (view === 'statement') {
          // A fatura do cartão que vence no mês: as compras dela podem ser de meses anteriores
          if (!accountId || !month) {
            throw new HttpError(400, 'Informe o cartão e o mês da fatura.', 'accountId')
          }
          where = and(
            groupFilter,
            eq(transactions.accountId, accountId),
            eq(transactions.statementMonth, month),
          )
        } else {
          const range = month ? monthRange(month) : null
          /*
           * O detalhe de um número do relatório: a categoria escolhida leva junto as
           * subcategorias dela, porque na tabela o valor da principal já soma as filhas.
           */
          const splitFilter = await splitCondition(groupId, categoryId, uncategorized)
          where = and(
            groupFilter,
            type ? eq(transactions.type, type) : undefined,
            accountId ? eq(transactions.accountId, accountId) : undefined,
            range ? gte(transactions.purchaseDate, range.from) : undefined,
            range ? lt(transactions.purchaseDate, range.to) : undefined,
            from ? gte(date, from) : undefined,
            to ? lte(date, to) : undefined,
            splitFilter,
          )
        }

        const rows = await db
          .select()
          .from(transactions)
          .where(where)
          /*
           * Mais recente primeiro. As parcelas de uma compra dividem a mesma data — entre
           * elas, vale a ordem da série: "1 de 10" antes de "2 de 10".
           */
          .orderBy(
            desc(transactions.purchaseDate),
            asc(transactions.installmentNumber),
            desc(transactions.createdAt),
          )
        return c.json(await present(rows))
      })

      // Com parcelas, cria uma linha por mês numa transação só: ou entram todas, ou nenhuma
      .post('/', zValidator('json', transactionFormSchema, onInvalid), async (c) => {
        const values = c.req.valid('json')
        const groupId = c.var.groupId
        await assertSplitCategories(db, groupId, values)
        await assertContact(db, groupId, values.contactId)
        const cycle = await accountCycle(db, groupId, values.accountId)

        const count = values.installments
        const amounts = splitInstallments(values.amountCents, count)
        const seriesId = count > 1 ? randomUUID() : null

        const created = await db.transaction(async (tx) => {
          const rows: Row[] = []
          for (const [index, amountCents] of amounts.entries()) {
            /*
             * Todas as parcelas são da **data da compra**: foi ali que o gasto aconteceu, e é
             * assim que elas somam juntas no regime de competência. O que anda mês a mês é o
             * caixa — a fatura de cada parcela, ou a data de pagamento fora do cartão.
             */
            const [row] = await tx
              .insert(transactions)
              .values({
                groupId,
                type: values.type,
                amountCents,
                description: values.description,
                accountId: values.accountId,
                contactId: values.contactId,
                purchaseDate: values.purchaseDate,
                ...cashFields(values.purchaseDate, values.paymentDate, cycle, index),
                installmentGroupId: seriesId,
                installmentNumber: seriesId ? index + 1 : null,
                installmentCount: seriesId ? count : null,
                createdBy: c.var.user.id,
              })
              .returning()
            if (!row) throw new HttpError(500, 'Não foi possível salvar o lançamento.')
            await replaceSplits(tx, groupId, row.id, splitsFor(amountCents, values.splits))
            await registrar(tx, {
              groupId,
              entity: 'transaction',
              entityId: row.id,
              action: 'create',
              actorId: c.var.user.id,
              label: row.description,
            })
            rows.push(row)
          }
          return rows
        })

        notify(deps, c, 'transactions')
        const [first] = await present(created.slice(0, 1))
        return c.json(first, 201)
      })

      /*
       * scope=one: só este lançamento.
       * scope=all (parcelas): este recebe tudo; as outras parcelas recebem tipo, descrição,
       * conta e categorias (na mesma proporção), mas mantêm o valor e a data delas.
       */
      .patch(
        '/:id',
        zValidator('query', editScopeQuerySchema, onInvalid),
        zValidator('json', transactionFormSchema, onInvalid),
        async (c) => {
          const { scope } = c.req.valid('query')
          const values = c.req.valid('json')
          const groupId = c.var.groupId
          const current = await findOwn(groupId, c.req.param('id'))
          await assertSplitCategories(db, groupId, values)
          await assertContact(db, groupId, values.contactId)
          const cycle = await accountCycle(db, groupId, values.accountId)

          const updated = await db.transaction(async (tx) => {
            const [row] = await tx
              .update(transactions)
              .set({
                type: values.type,
                amountCents: values.amountCents,
                description: values.description,
                accountId: values.accountId,
                contactId: values.contactId,
                purchaseDate: values.purchaseDate,
                ...cashFields(values.purchaseDate, values.paymentDate, cycle),
                updatedAt: new Date(),
              })
              .where(eq(transactions.id, current.id))
              .returning()
            if (!row) throw new HttpError(404, 'Lançamento não encontrado.')
            await replaceSplits(tx, groupId, row.id, values.splits)

            /*
             * Só os campos que a pessoa enxerga. As categorias ficam de fora da comparação
             * porque moram nas partes: dizer "mudou as categorias" já conta a história, e o
             * detalhe está no próprio lançamento.
             */
            const mudou = diferencas(current, row, [
              'type',
              'amountCents',
              'description',
              'accountId',
              'contactId',
              'purchaseDate',
              'paymentDate',
              'statementMonth',
            ])
            if (mudou.length > 0) {
              await registrar(tx, {
                groupId,
                entity: 'transaction',
                entityId: row.id,
                action: 'update',
                actorId: c.var.user.id,
                label: row.description,
                changes: mudou,
              })
            }

            if (scope === 'all' && current.installmentGroupId) {
              const siblings = await tx
                .select()
                .from(transactions)
                .where(
                  and(
                    eq(transactions.groupId, groupId),
                    eq(transactions.installmentGroupId, current.installmentGroupId),
                  ),
                )
              for (const sibling of siblings) {
                if (sibling.id === current.id) continue
                await tx
                  .update(transactions)
                  .set({
                    type: values.type,
                    description: values.description,
                    accountId: values.accountId,
                    contactId: values.contactId,
                    ...cashFields(sibling.purchaseDate, sibling.paymentDate, cycle),
                    updatedAt: new Date(),
                  })
                  .where(eq(transactions.id, sibling.id))
                await replaceSplits(
                  tx,
                  groupId,
                  sibling.id,
                  splitsFor(sibling.amountCents, values.splits),
                )
              }
            }
            return row
          })

          notify(deps, c, 'transactions')
          const [result] = await present([updated])
          return c.json(result)
        },
      )

      // scope=one: só este · following: este e as próximas parcelas · all: a série inteira
      .delete('/:id', zValidator('query', deleteScopeQuerySchema, onInvalid), async (c) => {
        const { scope } = c.req.valid('query')
        const current = await findOwn(c.var.groupId, c.req.param('id'))
        const series = current.installmentGroupId

        const marcarExcluido = {
          deletedAt: new Date(),
          deletedBy: c.var.user.id,
          updatedAt: new Date(),
        }
        const alvo =
          scope === 'one' || !series
            ? eq(transactions.id, current.id)
            : scope === 'following'
              ? and(
                  eq(transactions.groupId, c.var.groupId),
                  eq(transactions.installmentGroupId, series),
                  gte(transactions.installmentNumber, current.installmentNumber ?? 1),
                )
              : and(
                  eq(transactions.groupId, c.var.groupId),
                  eq(transactions.installmentGroupId, series),
                )

        const excluidos = await db
          .update(transactions)
          .set(marcarExcluido)
          .where(and(alvo, naoExcluido))
          .returning({ id: transactions.id, description: transactions.description })

        for (const excluido of excluidos) {
          await registrar(db, {
            groupId: c.var.groupId,
            entity: 'transaction',
            entityId: excluido.id,
            action: 'delete',
            actorId: c.var.user.id,
            label: excluido.description,
          })
        }

        notify(deps, c, 'transactions')
        return c.body(null, 204)
      })

      /*
       * A lixeira: o que foi excluído nos últimos tempos, com quem excluiu. Restaurar devolve
       * o lançamento exatamente como estava — as partes nunca foram embora.
       */
      .get('/deleted', async (c) => {
        const rows = await db
          .select({ transacao: transactions, deletedByName: user.name })
          .from(transactions)
          .leftJoin(user, eq(user.id, transactions.deletedBy))
          .where(and(eq(transactions.groupId, c.var.groupId), isNotNull(transactions.deletedAt)))
          .orderBy(desc(transactions.deletedAt))
          .limit(100)

        const ids = rows.map((row) => row.transacao.id)
        const partes = ids.length
          ? await db
              .select()
              .from(transactionSplits)
              .where(inArray(transactionSplits.transactionId, ids))
          : []

        return c.json(
          rows.map(({ transacao, deletedByName }) => ({
            id: transacao.id,
            description: transacao.description,
            amountCents: transacao.amountCents,
            type: transacao.type,
            purchaseDate: transacao.purchaseDate,
            accountId: transacao.accountId,
            categoryIds: partes
              .filter((parte) => parte.transactionId === transacao.id)
              .map((parte) => parte.categoryId),
            deletedAt: transacao.deletedAt?.toISOString() ?? null,
            deletedByName: deletedByName ?? 'alguém',
          })),
        )
      })

      .post('/:id/restore', async (c) => {
        const [restaurado] = await db
          .update(transactions)
          .set({ deletedAt: null, deletedBy: null, updatedAt: new Date() })
          .where(
            and(
              eq(transactions.id, c.req.param('id')),
              eq(transactions.groupId, c.var.groupId),
              isNotNull(transactions.deletedAt),
            ),
          )
          .returning({ id: transactions.id, description: transactions.description })
        if (!restaurado) throw new HttpError(404, 'Lançamento não encontrado na lixeira.')

        await registrar(db, {
          groupId: c.var.groupId,
          entity: 'transaction',
          entityId: restaurado.id,
          action: 'restore',
          actorId: c.var.user.id,
          label: restaurado.description,
        })
        notify(deps, c, 'transactions')
        return c.body(null, 204)
      })

      /** O histórico de um lançamento: quem criou, quem mudou o quê */
      .get('/:id/history', async (c) =>
        c.json(await historicoDe(db, c.var.groupId, 'transaction', c.req.param('id'))),
      )
  )
}
