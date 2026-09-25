import type { ImportBatch, ImportResult, ImportSource, UndoResult } from '@bolso/shared'
import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import type { Database } from '../db/client'
import {
  accounts,
  importBatches,
  importBatchItems,
  pendingTransactions,
  transactionSplits,
  transactions,
  user,
} from '../db/schema'
import { HttpError, notFound } from '../http'
import { desligarProva } from './reconciliation'

/*
 * Histórico de importações, e o caminho de volta.
 *
 * Toda confirmação — do extrato ou da caixa de entrada do banco — vira um lote com os itens
 * que ela tocou. Desfazer anda por esses itens ao contrário:
 *
 * - o que **nasceu** da importação é apagado (as partes vão junto, por cascata);
 * - a **transferência** perde as duas pernas, porque meia transferência não existe;
 * - o que foi **conciliado** continua onde estava: só perde o identificador do banco, para
 *   poder ser conciliado de novo com outra linha;
 * - o que veio do banco **volta a esperar aprovação**, inclusive o que foi dispensado.
 *
 * O que sumiu no meio do caminho (alguém apagou o lançamento na mão) é contado à parte, em
 * vez de fazer o desfazer inteiro falhar: a pessoa precisa do resultado, não de um erro.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export type ItemDoLote = {
  action: 'create' | 'link' | 'transfer' | 'skip'
  transactionId?: string | null
  transferGroupId?: string | null
  pendingId?: string | null
  externalId: string
  /** Só quando conciliar dividiu o lançamento: o valor que ele tinha antes */
  previousAmountCents?: number | null
}

/**
 * Guarda o lote junto com o resto da confirmação: se ela falhar, o histórico não nasce.
 *
 * Os totais vêm prontos porque nem todo item precisa ser guardado — uma linha do extrato que
 * foi ignorada não deixa nada para desfazer, mas continua contando no resumo.
 */
export async function registrarLote(
  tx: Tx,
  dados: {
    groupId: string
    source: ImportSource
    connectionId: string | null
    accountId: string
    label: string
    userId: string
    totais: ImportResult
  },
  itens: ItemDoLote[],
) {
  const { totais } = dados
  if (totais.created + totais.linked + totais.transferred + totais.skipped === 0) return null

  const [lote] = await tx
    .insert(importBatches)
    .values({
      groupId: dados.groupId,
      source: dados.source,
      connectionId: dados.connectionId,
      accountId: dados.accountId,
      label: dados.label,
      createdCount: totais.created,
      linkedCount: totais.linked,
      transferredCount: totais.transferred,
      skippedCount: totais.skipped,
      createdBy: dados.userId,
    })
    .returning({ id: importBatches.id })
  if (!lote) throw new HttpError(500, 'Não foi possível registrar a importação.')

  if (itens.length === 0) return lote.id
  await tx.insert(importBatchItems).values(
    itens.map((item) => ({
      batchId: lote.id,
      action: item.action,
      transactionId: item.transactionId ?? null,
      transferGroupId: item.transferGroupId ?? null,
      pendingId: item.pendingId ?? null,
      externalId: item.externalId,
      previousAmountCents: item.previousAmountCents ?? null,
    })),
  )
  return lote.id
}

export async function listarLotes(db: Database, groupId: string): Promise<ImportBatch[]> {
  const rows = await db
    .select({ lote: importBatches, accountName: accounts.name, authorName: user.name })
    .from(importBatches)
    .innerJoin(accounts, eq(accounts.id, importBatches.accountId))
    .innerJoin(user, eq(user.id, importBatches.createdBy))
    .where(eq(importBatches.groupId, groupId))
    .orderBy(desc(importBatches.createdAt))
    .limit(50)

  return rows.map(({ lote, accountName, authorName }) => ({
    id: lote.id,
    source: lote.source === 'ofx' ? 'ofx' : 'bank',
    label: lote.label,
    accountName,
    created: lote.createdCount,
    linked: lote.linkedCount,
    transferred: lote.transferredCount,
    skipped: lote.skippedCount,
    authorName,
    createdAt: lote.createdAt.toISOString(),
    undoneAt: lote.undoneAt?.toISOString() ?? null,
  }))
}

export async function desfazerLote(
  db: Database,
  groupId: string,
  batchId: string,
): Promise<UndoResult> {
  const [lote] = await db
    .select()
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId), eq(importBatches.groupId, groupId)))
    .limit(1)
  if (!lote) throw notFound('Importação')
  if (lote.undoneAt) throw new HttpError(409, 'Esta importação já foi desfeita.')

  const itens = await db
    .select()
    .from(importBatchItems)
    .where(eq(importBatchItems.batchId, batchId))

  const resultado: UndoResult = { removed: 0, unlinked: 0, restored: 0, missing: 0 }

  await db.transaction(async (tx) => {
    for (const item of itens) {
      if (item.action === 'transfer' && item.transferGroupId) {
        const apagadas = await tx
          .delete(transactions)
          .where(
            and(
              eq(transactions.groupId, groupId),
              eq(transactions.transferGroupId, item.transferGroupId),
            ),
          )
          .returning({ id: transactions.id })
        if (apagadas.length === 0) resultado.missing += 1
        else resultado.removed += apagadas.length
      } else if (item.action === 'create' && item.transactionId) {
        const apagadas = await tx
          .delete(transactions)
          .where(and(eq(transactions.id, item.transactionId), eq(transactions.groupId, groupId)))
          .returning({ id: transactions.id })
        if (apagadas.length === 0) resultado.missing += 1
        else resultado.removed += 1
      } else if (item.action === 'link' && item.transactionId) {
        /*
         * Só tira o vínculo se ele ainda for o desta importação: se a pessoa já conciliou
         * esse lançamento com outra coisa depois, mexer aqui estragaria o trabalho dela.
         */
        /*
         * Conciliar pode ter **dividido** este lançamento em partes. As partes novas são
         * apagadas como qualquer 'create'; aqui devolvemos a esta o valor que ela tinha
         * antes, senão o lançamento ficaria com o pedaço em vez do todo.
         */
        const soltas = await tx
          .update(transactions)
          .set({
            ...(item.previousAmountCents ? { amountCents: item.previousAmountCents } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(transactions.id, item.transactionId), eq(transactions.groupId, groupId)))
          .returning({ id: transactions.id })
        // A prova sai junto: o lançamento volta a não ter conferência do banco
        await desligarProva(tx, groupId, { transactionId: item.transactionId })
        if (soltas.length === 0) resultado.missing += 1
        else {
          resultado.unlinked += 1
          if (item.previousAmountCents) {
            await tx
              .update(transactionSplits)
              .set({ amountCents: item.previousAmountCents })
              .where(eq(transactionSplits.transactionId, item.transactionId))
          }
        }
      }
    }

    // Tudo o que veio do banco volta para a fila, inclusive o que foi dispensado
    const pendentes = itens.flatMap((item) => (item.pendingId ? [item.pendingId] : []))
    if (pendentes.length > 0) {
      const voltaram = await tx
        .update(pendingTransactions)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(
          and(eq(pendingTransactions.groupId, groupId), inArray(pendingTransactions.id, pendentes)),
        )
        .returning({ id: pendingTransactions.id })
      resultado.restored = voltaram.length
    }

    await tx
      .update(importBatches)
      .set({ undoneAt: new Date(), updatedAt: new Date() })
      .where(and(eq(importBatches.id, batchId), isNull(importBatches.undoneAt)))
  })

  return resultado
}
