import { randomUUID } from 'node:crypto'
import type { CardCycle, ReconciliationSource, TransactionOrigin } from '@bolso/shared'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'
import type { Database } from '../db/client'
import { accounts, transactionSplits, transactions } from '../db/schema'
import { HttpError } from '../http'
import { cashFields } from '../statements'
import { tipoDe } from './reconcile'
import { ligarProva } from './reconciliation'

/*
 * O que acontece quando a pessoa aprova uma linha vinda de fora — do extrato ou do banco
 * conectado. São três desfechos: vira lançamento novo, gruda num lançamento que já existia,
 * ou vira uma transferência entre contas. Nos três, o identificador de origem fica guardado,
 * e é ele que impede a mesma linha de entrar de novo na próxima busca.
 */

type Contexto = {
  groupId: string
  accountId: string
  userId: string
  cycle: CardCycle | null
  origin: TransactionOrigin
  /** De onde vem a prova: Open Finance ou extrato */
  source: ReconciliationSource
}

type Linha = {
  externalId: string
  date: string
  /** Negativo = saída */
  amountCents: number
  description: string
  /*
   * Parcela de cartão. A competência de todas as parcelas é a data da **compra**; o que anda
   * mês a mês é o caixa, e para isso vale a data que o banco deu a esta parcela.
   */
  installmentNumber?: number | null
  installmentCount?: number | null
  purchaseDate?: string | null
  merchant?: string | null
}

type Parte = { categoryId: string | null; amountCents: number }

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function criarLancamento(
  tx: Tx,
  contexto: Contexto,
  linha: Linha,
  categoryId: string | null,
  contactId: string | null,
  /*
   * O que a pessoa preencheu no formulário completo, quando detalhou a linha. Vale para a
   * descrição, as datas e a divisão em categorias — não para o valor nem para a conta, que
   * são o que identifica o movimento no banco.
   */
  rascunho: {
    description: string
    purchaseDate: string
    paymentDate: string | null
    splits: Parte[]
  } | null = null,
) {
  const amountCents = Math.abs(linha.amountCents)
  const parcela = await serieDaParcela(tx, contexto, linha)
  /*
   * Onde o gasto aconteceu. A parcela manda primeiro (a compra é de outro mês); depois o que
   * a pessoa corrigiu no formulário; e, no fim, a data que o banco deu à linha. O caixa é
   * outra conta: continua saindo da data do banco, que é quando o dinheiro se move.
   */
  const purchaseDate = parcela?.purchaseDate ?? rascunho?.purchaseDate ?? linha.date

  const [created] = await tx
    .insert(transactions)
    .values({
      groupId: contexto.groupId,
      type: tipoDe(linha.amountCents),
      amountCents,
      /*
       * O que a pessoa escreveu vale mais que o texto do banco: ela detalhou a linha
       * justamente para trocar "PARC=110IMUNO PARC 02/10" por "Vacinas do Vicente".
       */
      description: rascunho?.description?.trim() || linha.description,
      accountId: contexto.accountId,
      contactId,
      purchaseDate,
      // No cartão o pagamento é a fatura, calculada; na conta comum, a data que ela corrigiu
      ...cashFields(linha.date, rascunho?.paymentDate ?? linha.date, contexto.cycle),
      installmentGroupId: parcela?.groupId ?? null,
      installmentNumber: parcela?.number ?? null,
      installmentCount: parcela?.count ?? null,
      origin: contexto.origin,
      createdBy: contexto.userId,
    })
    .returning()
  if (!created) throw new HttpError(500, 'Não foi possível importar o lançamento.')
  await ligarProva(tx, {
    groupId: contexto.groupId,
    transactionId: created.id,
    source: contexto.source,
    externalId: linha.externalId,
    label: linha.description,
    userId: contexto.userId,
  })
  const partes =
    rascunho && rascunho.splits.length > 0
      ? rascunho.splits.map((parte) => ({ ...parte, amountCents: Math.abs(parte.amountCents) }))
      : [{ categoryId, amountCents }]
  await tx.insert(transactionSplits).values(
    partes.map((parte) => ({
      groupId: contexto.groupId,
      transactionId: created.id,
      categoryId: parte.categoryId,
      amountCents: parte.amountCents,
    })),
  )
  return created.id
}

/**
 * A linha é dinheiro trocando de conta: pagamento da fatura do cartão, dinheiro indo para a
 * poupança, saque. Vira uma **transferência**, que são dois lançamentos com o mesmo
 * `transfer_group_id` e nenhuma categoria — é a falta de categoria que os mantém fora dos
 * relatórios e do orçamento, porque trocar dinheiro de bolso não é gastar nem ganhar.
 *
 * O sinal da linha decide a direção: saiu daqui, vai para a outra conta; entrou aqui, veio
 * de lá. Só a perna desta conta leva o identificador do banco: é esta que o extrato mostra,
 * e a outra ponta aparecerá no extrato dela, quando aquela conta também for conferida.
 */
export async function criarTransferencia(
  tx: Tx,
  contexto: Contexto,
  linha: Linha,
  counterAccountId: string,
) {
  if (counterAccountId === contexto.accountId) {
    throw new HttpError(400, 'A transferência precisa ser entre duas contas diferentes.')
  }
  const [outra] = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.id, counterAccountId), eq(accounts.groupId, contexto.groupId)))
    .limit(1)
  if (!outra) throw new HttpError(400, 'Conta não encontrada.', 'counterAccountId')

  const saiuDaqui = linha.amountCents < 0
  const transferGroupId = randomUUID()
  const comum = {
    groupId: contexto.groupId,
    amountCents: Math.abs(linha.amountCents),
    description: linha.description,
    contactId: null,
    purchaseDate: linha.date,
    paymentDate: linha.date,
    transferGroupId,
    origin: contexto.origin,
    createdBy: contexto.userId,
  }

  const pernas = await tx
    .insert(transactions)
    .values([
      {
        ...comum,
        type: saiuDaqui ? ('expense' as const) : ('income' as const),
        accountId: contexto.accountId,
      },
      {
        ...comum,
        type: saiuDaqui ? ('income' as const) : ('expense' as const),
        accountId: counterAccountId,
      },
    ])
    .returning({ id: transactions.id, accountId: transactions.accountId })

  // Só a perna desta conta é o movimento que o banco mandou; a outra é o outro lado
  const daConta = pernas.find((perna) => perna.accountId === contexto.accountId)
  if (daConta) {
    await ligarProva(tx, {
      groupId: contexto.groupId,
      transactionId: daConta.id,
      source: contexto.source,
      externalId: linha.externalId,
      label: linha.description,
      userId: contexto.userId,
    })
  }
  return transferGroupId
}

/**
 * Gruda a linha num lançamento que já existia. A trava é o índice único da prova: se alguém
 * do grupo conciliou esse mesmo movimento primeiro, a inserção não passa e a pessoa recebe o
 * aviso — em vez de o mesmo movimento do banco acabar ligado a dois lançamentos.
 */
export async function ligarExistente(
  tx: Tx,
  contexto: Pick<Contexto, 'groupId' | 'accountId' | 'userId' | 'source'>,
  transactionId: string,
  externalId: string,
  label = '',
) {
  const [existe] = await tx
    .select({ id: transactions.id, description: transactions.description })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.groupId, contexto.groupId),
        isNull(transactions.deletedAt),
        eq(transactions.accountId, contexto.accountId),
      ),
    )
    .limit(1)
  if (!existe) throw new HttpError(404, 'Lançamento não encontrado.')

  await ligarProva(tx, {
    groupId: contexto.groupId,
    transactionId,
    source: contexto.source,
    externalId,
    label: label || existe.description,
    userId: contexto.userId,
  })
}

/**
 * Quais linhas apontam para o mesmo lançamento. Uma só é o caso comum; mais de uma quer
 * dizer que aquele lançamento vai ser dividido entre elas.
 */
export function agruparConciliacoes(
  decisions: { action: string; transactionId?: string | undefined; fitId: string }[],
) {
  const grupos = new Map<string, string[]>()
  for (const decision of decisions) {
    if (decision.action !== 'link' || !decision.transactionId) continue
    grupos.set(decision.transactionId, [
      ...(grupos.get(decision.transactionId) ?? []),
      decision.fitId,
    ])
  }
  return grupos
}

/**
 * Uma compra, duas saídas no banco.
 *
 * Acontece de verdade: a pessoa paga a carne, decide levar mais um pedaço, e o banco cobra
 * duas vezes. No Bolso existe **um** lançamento, feito à mão, com o valor cheio. Conciliar
 * um-para-um não resolve — nenhuma das duas linhas bate com ele sozinha.
 *
 * Então o lançamento se divide: a primeira parte continua sendo ele (com o valor reduzido) e
 * cada linha a mais vira uma parte nova, igual em tudo menos no valor. No fim, o Bolso mostra
 * os mesmos dois movimentos que o banco mostra, e cada um carrega o seu identificador.
 */
export async function conciliarDividindo(
  tx: Tx,
  contexto: Pick<Contexto, 'groupId' | 'accountId' | 'userId' | 'source'>,
  transactionId: string,
  linhas: Linha[],
) {
  const [original] = await tx
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.groupId, contexto.groupId),
        eq(transactions.accountId, contexto.accountId),
        isNull(transactions.deletedAt),
      ),
    )
    .limit(1)
  if (!original) throw new HttpError(404, 'Lançamento não encontrado.')

  const soma = linhas.reduce((total, linha) => total + Math.abs(linha.amountCents), 0)
  if (soma !== original.amountCents) {
    throw new HttpError(
      400,
      `As ${linhas.length} linhas somam ${reais(soma)}, e “${original.description}” é de ${reais(original.amountCents)}. Os dois valores têm de bater.`,
    )
  }
  if (linhas.some((linha) => tipoDe(linha.amountCents) !== original.type)) {
    throw new HttpError(400, 'Uma das linhas é de entrada e a outra de saída.')
  }

  const partes = await tx
    .select()
    .from(transactionSplits)
    .where(eq(transactionSplits.transactionId, original.id))
  if (partes.length > 1) {
    throw new HttpError(
      400,
      `“${original.description}” está dividido em categorias. Junte-o numa categoria só antes de conciliar em partes.`,
    )
  }
  const categoryId = partes[0]?.categoryId ?? null

  const [primeira, ...demais] = linhas
  if (!primeira) throw new HttpError(400, 'Nenhuma linha para conciliar.')

  // A primeira parte continua sendo o lançamento de sempre, só que menor
  await tx
    .update(transactions)
    .set({ amountCents: Math.abs(primeira.amountCents), updatedAt: new Date() })
    .where(eq(transactions.id, original.id))
  await ligarProva(tx, {
    groupId: contexto.groupId,
    transactionId: original.id,
    source: contexto.source,
    externalId: primeira.externalId,
    label: primeira.description,
    userId: contexto.userId,
  })
  await tx
    .update(transactionSplits)
    .set({ amountCents: Math.abs(primeira.amountCents) })
    .where(eq(transactionSplits.transactionId, original.id))

  /*
   * As outras partes nascem iguais ao original — mesma data, mesma categoria, mesmo contato —
   * porque é a mesma compra. Só o valor e o identificador do banco mudam.
   */
  const criadas: string[] = []
  for (const linha of demais) {
    const amountCents = Math.abs(linha.amountCents)
    const [parte] = await tx
      .insert(transactions)
      .values({
        groupId: original.groupId,
        type: original.type,
        amountCents,
        description: original.description,
        accountId: original.accountId,
        contactId: original.contactId,
        purchaseDate: original.purchaseDate,
        paymentDate: original.paymentDate,
        statementMonth: original.statementMonth,
        origin: original.origin,
        createdBy: original.createdBy,
      })
      .returning({ id: transactions.id })
    if (!parte) throw new HttpError(500, 'Não foi possível dividir o lançamento.')
    await ligarProva(tx, {
      groupId: contexto.groupId,
      transactionId: parte.id,
      source: contexto.source,
      externalId: linha.externalId,
      label: linha.description,
      userId: contexto.userId,
    })
    await tx.insert(transactionSplits).values({
      groupId: original.groupId,
      transactionId: parte.id,
      categoryId,
      amountCents,
    })
    criadas.push(parte.id)
  }

  return { previousAmountCents: original.amountCents, criadas }
}

const reais = (centavos: number) =>
  (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/*
 * Juntar as parcelas da mesma compra.
 *
 * O Pluggy não manda um identificador que ligue as dez parcelas — eles dizem isso na
 * documentação e recomendam heurística. A nossa âncora é a **data da compra** (que vem do
 * banco quando ele manda, ou é calculada): as parcelas de uma mesma compra dividem a data, o
 * total de parcelas e a conta. Quando uma parcela dessa série já entrou, a nova entra junto;
 * senão, começa uma série nova.
 */
async function serieDaParcela(tx: Tx, contexto: Contexto, linha: Linha) {
  const number = linha.installmentNumber ?? 0
  const count = linha.installmentCount ?? 0
  const purchaseDate = linha.purchaseDate
  if (!purchaseDate || number < 1 || count < 2) return null

  const [irma] = await tx
    .select({ groupId: transactions.installmentGroupId })
    .from(transactions)
    .where(
      and(
        eq(transactions.groupId, contexto.groupId),
        eq(transactions.accountId, contexto.accountId),
        isNull(transactions.deletedAt),
        eq(transactions.purchaseDate, purchaseDate),
        eq(transactions.installmentCount, count),
        eq(transactions.description, linha.description),
        isNotNull(transactions.installmentGroupId),
      ),
    )
    .limit(1)

  return {
    groupId: irma?.groupId ?? randomUUID(),
    number,
    count,
    purchaseDate,
  }
}
