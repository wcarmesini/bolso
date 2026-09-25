import { and, eq, inArray, ne } from 'drizzle-orm'
import type { Database } from '../db/client'
import { pendingTransactions } from '../db/schema'

/*
 * A caixa de entrada e o que acontece com ela depois.
 *
 * A fila é o acerto de contas entre o que o banco mandou e o que foi aceito. Se o lançamento
 * que nasceu de uma linha é **apagado**, aquela linha volta a não ter resposta — e precisa
 * voltar para a fila, senão o movimento some do app sem ninguém ter decidido nada.
 *
 * Restaurar o lançamento faz o caminho de volta: a linha sai da fila de novo, para não
 * aparecer a mesma coisa duas vezes.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database

/** Apagou o lançamento: a linha do banco volta a esperar aprovação */
export async function devolverParaFila(tx: Tx, groupId: string, externalIds: string[]) {
  const ids = externalIds.filter(Boolean)
  if (ids.length === 0) return
  await tx
    .update(pendingTransactions)
    .set({ status: 'pending', updatedAt: new Date() })
    .where(
      and(
        eq(pendingTransactions.groupId, groupId),
        inArray(pendingTransactions.externalId, ids),
        ne(pendingTransactions.status, 'pending'),
      ),
    )
}

/** Restaurou o lançamento: a linha sai da fila, porque já tem resposta de novo */
export async function tirarDaFila(tx: Tx, groupId: string, externalIds: string[]) {
  const ids = externalIds.filter(Boolean)
  if (ids.length === 0) return
  await tx
    .update(pendingTransactions)
    .set({ status: 'done', updatedAt: new Date() })
    .where(
      and(
        eq(pendingTransactions.groupId, groupId),
        inArray(pendingTransactions.externalId, ids),
        eq(pendingTransactions.status, 'pending'),
      ),
    )
}
