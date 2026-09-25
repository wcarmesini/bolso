import type { ReconciliationSource, TransactionSource } from '@bolso/shared'
import { and, eq, inArray } from 'drizzle-orm'
import type { Database } from '../db/client'
import { transactionSources, transactions } from '../db/schema'
import { HttpError } from '../http'

/*
 * A conciliação: a prova de que um lançamento é um movimento que o banco confirmou.
 *
 * Tudo passa por aqui — ligar, desligar e perguntar quem já está ligado — para não existir
 * um segundo caminho que esqueça a trava. A trava é o índice único (grupo + origem +
 * identificador): um movimento do banco pertence a um lançamento só, e o banco de dados
 * garante isso mesmo que duas pessoas tentem ao mesmo tempo.
 */

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0] | Database

export async function ligarProva(
  tx: Tx,
  dados: {
    groupId: string
    transactionId: string
    source: ReconciliationSource
    externalId: string
    label: string
    userId: string
  },
) {
  /*
   * Uma prova por origem, no máximo: um lançamento é **um** movimento em cada caminho. Duas
   * linhas do mesmo extrato apontando para o mesmo lançamento seria outra coisa — uma compra
   * cobrada em partes —, e isso tem caminho próprio, que divide o lançamento.
   */
  const [daMesmaOrigem] = await tx
    .select({ id: transactionSources.id })
    .from(transactionSources)
    .where(
      and(
        eq(transactionSources.groupId, dados.groupId),
        eq(transactionSources.transactionId, dados.transactionId),
        eq(transactionSources.source, dados.source),
      ),
    )
    .limit(1)
  if (daMesmaOrigem) {
    throw new HttpError(409, 'Esse lançamento já foi conciliado com outra linha desta origem.')
  }

  const [criada] = await tx
    .insert(transactionSources)
    .values({
      groupId: dados.groupId,
      transactionId: dados.transactionId,
      source: dados.source,
      externalId: dados.externalId,
      label: dados.label,
      reconciledBy: dados.userId,
    })
    .onConflictDoNothing()
    .returning({ id: transactionSources.id })

  // O índice único não deixou: esse movimento do banco já é de outro lançamento
  if (!criada) {
    throw new HttpError(409, 'Esse movimento do banco já está conciliado com outro lançamento.')
  }
}

/** Os identificadores que estes lançamentos já carregam, por origem */
export async function provasDe(db: Database, groupId: string, transactionIds: string[]) {
  if (transactionIds.length === 0) return new Map<string, TransactionSource[]>()
  const rows = await db
    .select()
    .from(transactionSources)
    .where(
      and(
        eq(transactionSources.groupId, groupId),
        inArray(transactionSources.transactionId, transactionIds),
      ),
    )

  const mapa = new Map<string, TransactionSource[]>()
  for (const row of rows) {
    mapa.set(row.transactionId, [
      ...(mapa.get(row.transactionId) ?? []),
      {
        id: row.id,
        source: row.source as ReconciliationSource,
        externalId: row.externalId,
        label: row.label,
        createdAt: row.createdAt.toISOString(),
      },
    ])
  }
  return mapa
}

/** Quais destes movimentos do banco já pertencem a algum lançamento */
export async function jaConciliados(
  db: Database,
  groupId: string,
  source: ReconciliationSource,
  externalIds: string[],
) {
  if (externalIds.length === 0) return new Map<string, string>()
  const rows = await db
    .select({
      externalId: transactionSources.externalId,
      transactionId: transactionSources.transactionId,
    })
    .from(transactionSources)
    .innerJoin(transactions, eq(transactions.id, transactionSources.transactionId))
    .where(
      and(
        eq(transactionSources.groupId, groupId),
        eq(transactionSources.source, source),
        inArray(transactionSources.externalId, externalIds),
      ),
    )
  return new Map(rows.map((row) => [row.externalId, row.transactionId]))
}

/** Desfazer: o lançamento perde a prova e volta a poder ser editado e excluído */
export async function desligarProva(
  tx: Tx,
  groupId: string,
  filtro: { transactionId: string; sourceId?: string },
) {
  const soltas = await tx
    .delete(transactionSources)
    .where(
      and(
        eq(transactionSources.groupId, groupId),
        eq(transactionSources.transactionId, filtro.transactionId),
        ...(filtro.sourceId ? [eq(transactionSources.id, filtro.sourceId)] : []),
      ),
    )
    .returning({ externalId: transactionSources.externalId })
  return soltas.map((row) => row.externalId)
}

/*
 * A trava de edição. Valor, conta e tipo são o que identifica o movimento: mudá-los depois
 * de conciliar desfaz a prova sem ninguém perceber, e o lançamento fica dizendo que o banco
 * confirmou uma coisa que o banco nunca confirmou.
 */
export function exigirSemProva(
  provas: TransactionSource[],
  o_que: 'editar o valor, a conta ou o tipo' | 'excluir',
) {
  if (provas.length === 0) return
  throw new HttpError(
    409,
    `Este lançamento está conciliado com o banco. Desfaça a conciliação para ${o_que}.`,
  )
}
