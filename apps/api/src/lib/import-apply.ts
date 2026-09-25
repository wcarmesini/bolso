import { randomUUID } from 'node:crypto'
import type { CardCycle, TransactionOrigin } from '@bolso/shared'
import { and, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db/client'
import { accounts, transactionSplits, transactions } from '../db/schema'
import { HttpError } from '../http'
import { cashFields } from '../statements'
import { tipoDe } from './reconcile'

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
}

type Linha = {
  externalId: string
  date: string
  /** Negativo = saída */
  amountCents: number
  description: string
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

export async function criarLancamento(
  tx: Tx,
  contexto: Contexto,
  linha: Linha,
  categoryId: string | null,
  contactId: string | null,
) {
  const amountCents = Math.abs(linha.amountCents)
  const [created] = await tx
    .insert(transactions)
    .values({
      groupId: contexto.groupId,
      type: tipoDe(linha.amountCents),
      amountCents,
      description: linha.description,
      accountId: contexto.accountId,
      contactId,
      purchaseDate: linha.date,
      ...cashFields(linha.date, linha.date, contexto.cycle),
      origin: contexto.origin,
      externalId: linha.externalId,
      createdBy: contexto.userId,
    })
    .returning()
  if (!created) throw new HttpError(500, 'Não foi possível importar o lançamento.')
  await tx.insert(transactionSplits).values({
    groupId: contexto.groupId,
    transactionId: created.id,
    categoryId,
    amountCents,
  })
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

  await tx.insert(transactions).values([
    {
      ...comum,
      type: saiuDaqui ? ('expense' as const) : ('income' as const),
      accountId: contexto.accountId,
      externalId: linha.externalId,
    },
    {
      ...comum,
      type: saiuDaqui ? ('income' as const) : ('expense' as const),
      accountId: counterAccountId,
      externalId: null,
    },
  ])
  return transferGroupId
}

/**
 * Gruda a linha num lançamento que já existia. O `isNull(externalId)` é a trava: se alguém
 * do grupo conciliou esse mesmo lançamento primeiro, a atualização não pega ninguém e a
 * pessoa recebe o aviso em vez de criar uma ligação dupla.
 */
export async function ligarExistente(
  tx: Tx,
  contexto: Pick<Contexto, 'groupId' | 'accountId'>,
  transactionId: string,
  externalId: string,
) {
  const [linked] = await tx
    .update(transactions)
    .set({ externalId, updatedAt: new Date() })
    .where(
      and(
        eq(transactions.id, transactionId),
        eq(transactions.groupId, contexto.groupId),
        isNull(transactions.deletedAt),
        eq(transactions.accountId, contexto.accountId),
        isNull(transactions.externalId),
      ),
    )
    .returning({ id: transactions.id })
  if (!linked) throw new HttpError(409, 'Esse lançamento já foi conciliado com outra linha.')
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
  contexto: Pick<Contexto, 'groupId' | 'accountId'>,
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
        isNull(transactions.externalId),
      ),
    )
    .limit(1)
  if (!original) throw new HttpError(409, 'Esse lançamento já foi conciliado com outra linha.')

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
    .set({
      amountCents: Math.abs(primeira.amountCents),
      externalId: primeira.externalId,
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, original.id))
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
        externalId: linha.externalId,
        createdBy: original.createdBy,
      })
      .returning({ id: transactions.id })
    if (!parte) throw new HttpError(500, 'Não foi possível dividir o lançamento.')
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
