import { isBankReady } from '@bolso/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client'
import { bankConnections, integrationKeys, pendingTransactions } from '../db/schema'
import type { Deps } from '../http'
import { HttpError } from '../http'
import { decryptSecret } from './crypto'
import { buscarItem, buscarLancamentos } from './pluggy'
import { jaConciliados } from './reconciliation'

/*
 * Buscar no banco o que ainda não está no Bolso.
 *
 * Nada entra direto no orçamento: o que vem do banco para na caixa de entrada
 * (`pending_transactions`) e espera alguém aprovar. Esta busca roda sozinha de tempos em
 * tempos e também no botão "Atualizar agora" — as duas chamam esta mesma função.
 */

/** Quantos dias para trás reconferir a cada busca: banco reclassifica e ajusta lançamento */
const JANELA_DE_REVISAO = 7

/** De quanto em quanto tempo o Bolso busca sozinho */
export const INTERVALO_DE_BUSCA = 30 * 60 * 1000

const dias = (date: string, quantidade: number) => {
  const base = new Date(`${date}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + quantidade)
  return base.toISOString().slice(0, 10)
}

export type Credenciais = { clientId: string; clientSecret: string }

/*
 * As chaves de Pluggy do grupo. Costuma ser uma; um casal que divide o orçamento costuma ter
 * duas, porque o plano pessoal da Pluggy só conecta contas do próprio titular — cada pessoa
 * tem a sua, e cada conexão é buscada com a chave que a criou.
 */
export async function chavesDoGrupo(db: Database, groupId: string) {
  return db
    .select()
    .from(integrationKeys)
    .where(and(eq(integrationKeys.groupId, groupId), eq(integrationKeys.provider, 'pluggy')))
    .orderBy(asc(integrationKeys.createdAt))
}

const abrir = (
  chave: { clientId: string; secretCiphertext: string } | undefined,
  encryptionKey: string,
): Credenciais | null =>
  chave?.clientId
    ? {
        clientId: chave.clientId,
        clientSecret: decryptSecret(chave.secretCiphertext, encryptionKey),
      }
    : null

/** A chave pedida, ou a primeira do grupo quando não se pediu nenhuma */
export async function credenciaisDoGrupo(
  db: Database,
  encryptionKey: string,
  groupId: string,
  integrationKeyId?: string | null,
): Promise<Credenciais | null> {
  const chaves = await chavesDoGrupo(db, groupId)
  const escolhida = integrationKeyId
    ? chaves.find((chave) => chave.id === integrationKeyId)
    : chaves[0]
  return abrir(escolhida, encryptionKey)
}

export async function exigirCredenciais(
  db: Database,
  encryptionKey: string,
  groupId: string,
  integrationKeyId?: string | null,
) {
  const credenciais = await credenciaisDoGrupo(db, encryptionKey, groupId, integrationKeyId)
  if (!credenciais) {
    throw new HttpError(
      400,
      'Cadastre o Client ID e a chave do Pluggy em Ajustes → Integrações antes de conectar um banco.',
    )
  }
  return credenciais
}

type Conexao = typeof bankConnections.$inferSelect

/**
 * Busca uma conexão e guarda o que for novo na caixa de entrada.
 *
 * Devolve quantos lançamentos entraram. Quando a conexão ainda está trabalhando (ou pedindo
 * alguma confirmação no banco), só o estado é atualizado — insistir não adiantaria.
 */
export async function sincronizar(
  db: Database,
  credenciais: Credenciais,
  conexao: Conexao,
): Promise<number> {
  const item = await buscarItem(credenciais, conexao.itemId)

  await db
    .update(bankConnections)
    .set({
      status: item.status,
      statusMessage: item.statusMessage,
      connectorName: item.connectorName || conexao.connectorName,
      connectorImageUrl: item.connectorImageUrl ?? conexao.connectorImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(bankConnections.id, conexao.id))

  if (!isBankReady(item.status)) return 0

  /*
   * De onde buscar: nunca antes da data escolhida pela pessoa, e a partir da última busca
   * menos alguns dias — o banco ainda mexe no que mandou há pouco (muda descrição, ajusta
   * valor de compra internacional), e reconferir essa janela sai barato.
   */
  const ultima = conexao.lastSyncedAt?.toISOString().slice(0, 10)
  let desde =
    ultima && dias(ultima, -JANELA_DE_REVISAO) > conexao.startDate
      ? dias(ultima, -JANELA_DE_REVISAO)
      : conexao.startDate

  /*
   * A janela também tem de alcançar o que ainda espera decisão, por mais antigo que seja:
   * enquanto a linha está na fila, ela é um assunto aberto, e o banco pode ter mudado algo
   * nela (ou o Bolso pode ter aprendido a ler um campo que antes ignorava).
   */
  const [maisAntiga] = await db
    .select({ date: pendingTransactions.date })
    .from(pendingTransactions)
    .where(
      and(
        eq(pendingTransactions.connectionId, conexao.id),
        eq(pendingTransactions.status, 'pending'),
      ),
    )
    .orderBy(asc(pendingTransactions.date))
    .limit(1)
  if (maisAntiga && maisAntiga.date < desde) desde = maisAntiga.date

  const lancamentos = await buscarLancamentos(credenciais, conexao.externalAccountId, desde)

  if (lancamentos.length > 0) {
    // Já virou lançamento numa aprovação anterior: não volta para a caixa de entrada
    // Já conciliado com algum lançamento: não volta para a fila
    const conhecidos = await jaConciliados(
      db,
      conexao.groupId,
      'pluggy',
      lancamentos.map((item) => item.externalId),
    )
    const novos = lancamentos.filter((item) => !conhecidos.has(item.externalId))

    if (novos.length > 0) {
      /*
       * `doNothing` no índice único (grupo + identificador do banco): o que já está na caixa
       * de entrada, o que já foi aprovado e o que a pessoa dispensou ficam como estão. É o
       * que deixa esta busca rodar de novo quantas vezes for sem repetir nada.
       */
      await db
        .insert(pendingTransactions)
        .values(
          novos.map((item) => ({
            groupId: conexao.groupId,
            connectionId: conexao.id,
            accountId: conexao.accountId,
            externalId: item.externalId,
            date: item.date,
            amountCents: item.amountCents,
            description: item.description,
            kind: item.kind,
            installmentNumber: item.installment?.number ?? null,
            installmentCount: item.installment?.count ?? null,
            purchaseDate: item.installment?.purchaseDate ?? null,
            merchant: item.merchant,
            raw: item.raw,
          })),
        )
        /*
         * O que já está na fila é **atualizado**, não ignorado: o banco reenvia as linhas da
         * janela de revisão, e é assim que uma linha guardada por uma versão antiga do Bolso
         * ganha o que ela não tinha — a parcela, o estabelecimento, o payload inteiro. Só
         * mexe no que ainda espera decisão: aprovado e dispensado ficam como estão.
         */
        .onConflictDoUpdate({
          target: [pendingTransactions.groupId, pendingTransactions.externalId],
          set: {
            date: sql`excluded.date`,
            amountCents: sql`excluded.amount_cents`,
            description: sql`excluded.description`,
            kind: sql`excluded.kind`,
            installmentNumber: sql`excluded.installment_number`,
            installmentCount: sql`excluded.installment_count`,
            purchaseDate: sql`excluded.purchase_date`,
            merchant: sql`excluded.merchant`,
            raw: sql`excluded.raw`,
            updatedAt: new Date(),
          },
          setWhere: eq(pendingTransactions.status, 'pending'),
        })
    }
  }

  await db
    .update(bankConnections)
    .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
    .where(eq(bankConnections.id, conexao.id))

  return lancamentos.length
}

/**
 * A busca automática: passa por todas as conexões, uma a uma, e avisa em tempo real quem
 * estiver com o Bolso aberto. Erro de uma conexão não derruba as outras nem o processo.
 */
export function iniciarBuscaAutomatica(deps: Deps) {
  const { db, env, hub } = deps
  let rodando = false

  const rodada = async () => {
    if (rodando) return
    rodando = true
    try {
      const conexoes = await db.select().from(bankConnections)
      const porGrupo = new Map<string, Conexao[]>()
      for (const conexao of conexoes) {
        porGrupo.set(conexao.groupId, [...(porGrupo.get(conexao.groupId) ?? []), conexao])
      }

      for (const [groupId, doGrupo] of porGrupo) {
        let novidades = 0
        for (const conexao of doGrupo) {
          // Cada conexão com a chave que a criou: a do outro não enxerga a conta desta
          const credenciais = await credenciaisDoGrupo(
            db,
            env.ENCRYPTION_KEY,
            groupId,
            conexao.integrationKeyId,
          )
          if (!credenciais) continue
          try {
            novidades += await sincronizar(db, credenciais, conexao)
          } catch (error) {
            console.error('busca automática', conexao.itemId, error)
          }
        }
        if (novidades > 0) {
          hub.publish(groupId, { type: 'invalidate', resources: ['bank'], actorId: 'sistema' })
        }
      }
    } catch (error) {
      console.error('busca automática', error)
    } finally {
      rodando = false
    }
  }

  // Um minuto depois de subir (o servidor primeiro responde), e daí em diante no intervalo
  const inicio = setTimeout(() => void rodada(), 60_000)
  const relogio = setInterval(() => void rodada(), INTERVALO_DE_BUSCA)
  return () => {
    clearTimeout(inicio)
    clearInterval(relogio)
  }
}
