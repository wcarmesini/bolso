import { type BankAccountOption, lerParcelaDoTexto } from '@bolso/shared'
import { HttpError } from '../http'

/*
 * Cliente do Pluggy (Open Finance).
 *
 * Regra que não se negocia: o CLIENT_SECRET nunca sai do servidor. O navegador só recebe um
 * `connectToken`, que vale 30 minutos e serve apenas para abrir o widget de conexão.
 *
 * O caminho é sempre o mesmo: clientId + clientSecret viram uma apiKey (2 horas, guardada
 * aqui na memória), e a apiKey assina as chamadas seguintes.
 */

const BASE = 'https://api.pluggy.ai'

/** A apiKey vale 2h; renovamos antes, para não errar na virada */
const VALIDADE = 100 * 60 * 1000

type Credenciais = { clientId: string; clientSecret: string }

const cache = new Map<string, { apiKey: string; ate: number }>()

async function pedir<T>(caminho: string, init: RequestInit & { apiKey?: string } = {}) {
  const { apiKey, ...resto } = init
  // O `next` da paginação vem como URL inteira; o resto das chamadas usa só o caminho
  const endereco = caminho.startsWith('http') ? caminho : `${BASE}${caminho}`
  const resposta = await fetch(endereco, {
    ...resto,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-KEY': apiKey } : {}),
      ...resto.headers,
    },
  })
  if (!resposta.ok) {
    const corpo = await resposta.text()
    /*
     * Credencial errada é o único erro daqui que a pessoa consegue resolver sozinha, e o
     * Pluggy o devolve ora como 400, ora como 401/403 — no `/auth`, qualquer um dos três é
     * isso. Os outros viram "não respondeu como esperado" e vão para o log do servidor.
     */
    const recusado = resposta.status === 401 || resposta.status === 403
    if (recusado || (caminho === '/auth' && resposta.status === 400)) {
      throw new HttpError(400, 'O Pluggy recusou as credenciais. Confira o Client ID e a chave.')
    }
    // 410 = endereço aposentado. Dizer isso em vez de "tente de novo", que não resolveria
    if (resposta.status === 410) {
      console.error('pluggy', caminho, 'aposentado pelo Pluggy:', corpo.slice(0, 400))
      throw new HttpError(502, 'O Pluggy mudou esta parte da API e o Bolso precisa ser atualizado.')
    }
    console.error('pluggy', caminho, resposta.status, corpo.slice(0, 400))
    throw new HttpError(502, 'O Pluggy não respondeu como esperado. Tente de novo em instantes.')
  }
  return (await resposta.json()) as T
}

/** Troca clientId + secret por uma apiKey de 2 horas (guardada até perto do fim) */
export async function apiKeyDe({ clientId, clientSecret }: Credenciais) {
  const guardada = cache.get(clientId)
  if (guardada && guardada.ate > Date.now()) return guardada.apiKey
  const { apiKey } = await pedir<{ apiKey: string }>('/auth', {
    method: 'POST',
    body: JSON.stringify({ clientId, clientSecret }),
  })
  cache.set(clientId, { apiKey, ate: Date.now() + VALIDADE })
  return apiKey
}

/**
 * Token para o widget. Com `itemId`, o widget abre no modo "arrumar esta conexão" — é o que
 * resolve senha trocada e pedido de confirmação do banco, sem criar uma conexão nova.
 */
export async function connectToken(credenciais: Credenciais, itemId?: string) {
  const apiKey = await apiKeyDe(credenciais)
  const { accessToken } = await pedir<{ accessToken: string }>('/connect_token', {
    method: 'POST',
    apiKey,
    body: JSON.stringify(itemId ? { itemId } : {}),
  })
  return accessToken
}

type ItemResposta = {
  id: string
  status: string
  executionStatus?: string
  error?: { message?: string; code?: string } | null
  connector?: { name?: string; imageUrl?: string | null }
}

export type PluggyItem = {
  itemId: string
  status: string
  statusMessage: string | null
  connectorName: string
  connectorImageUrl: string | null
}

const comoItem = (item: ItemResposta): PluggyItem => ({
  itemId: item.id,
  status: item.status,
  statusMessage: item.error?.message ?? null,
  connectorName: item.connector?.name ?? 'Banco',
  connectorImageUrl: item.connector?.imageUrl ?? null,
})

export async function buscarItem(credenciais: Credenciais, itemId: string) {
  const apiKey = await apiKeyDe(credenciais)
  return comoItem(await pedir<ItemResposta>(`/items/${itemId}`, { apiKey }))
}

type ContaResposta = {
  id: string
  name: string
  number?: string | null
  type: string
  subtype?: string | null
  balance: number
  currencyCode?: string
}

/** Contas de uma conexão. O saldo vem em reais; aqui vira centavo inteiro, como no resto */
export async function buscarContas(credenciais: Credenciais, itemId: string) {
  const apiKey = await apiKeyDe(credenciais)
  const { results } = await pedir<{ results: ContaResposta[] }>(`/accounts?itemId=${itemId}`, {
    apiKey,
  })
  return results.map(
    (conta): Omit<BankAccountOption, 'linked'> => ({
      id: conta.id,
      name: conta.name,
      number: conta.number ?? null,
      type: conta.subtype ?? conta.type,
      balanceCents: Math.round(conta.balance * 100),
    }),
  )
}

type LancamentoResposta = {
  /** Os campos que o Bolso usa hoje; o resto chega junto e vai inteiro para `raw` */
  id: string
  description: string
  descriptionRaw?: string | null
  amount: number
  date: string
  type?: 'DEBIT' | 'CREDIT'
  status?: string
  category?: string | null
  paymentData?: { paymentMethod?: string | null } | null
  merchant?: { name?: string | null } | null
  /*
   * Só no cartão de crédito. `purchaseDate` é o ouro aqui: é a data em que a compra foi
   * feita, e não a data em que a parcela caiu na fatura. Nem todo banco manda — quando não
   * manda, a data da compra é calculada a partir do número da parcela.
   */
  creditCardMetadata?: {
    installmentNumber?: number | null
    totalInstallments?: number | null
    totalAmount?: number | null
    purchaseDate?: string | null
  } | null
}

export type PluggyTransaction = {
  externalId: string
  date: string
  /** Negativo = saída, igual ao extrato OFX */
  amountCents: number
  description: string
  kind: string | null
  /** Só no cartão parcelado: "2 de 10" e a data em que a compra foi feita */
  installment: {
    number: number
    count: number
    /** Data da compra, quando o banco manda; senão, calculada a partir do número da parcela */
    purchaseDate: string
    /** O banco informou a data, ou ela foi calculada? */
    purchaseDateFromBank: boolean
  } | null
  /** Nome do estabelecimento, quando vem: ajuda a juntar as parcelas da mesma compra */
  merchant: string | null
  /*
   * O lançamento inteiro, como o Pluggy mandou. Lemos poucos campos hoje, mas eles mandam
   * muito mais (estabelecimento com CNPJ, método de pagamento, identificador do provedor,
   * situação). Guardar tudo custa quase nada e evita descobrir no futuro que a informação
   * existia e foi jogada fora na leitura.
   */
  raw: Record<string, unknown>
}

/*
 * O Pluggy manda o valor e, separado, se foi débito ou crédito. Usamos o `type` para decidir
 * o sinal em vez de confiar no sinal do valor: em cartão de crédito ele vem ao contrário, e
 * "débito" querendo dizer "saiu dinheiro" vale para os dois casos.
 */
const centavosDe = (item: LancamentoResposta) => {
  const valor = Math.round(Math.abs(item.amount) * 100)
  return item.type === 'CREDIT' ? valor : -valor
}

/*
 * O `next` diz onde continuar. O Pluggy manda ora a URL inteira, ora só o pedaço da busca,
 * ora o cursor sozinho — aceitar as três formas evita quebrar de novo na próxima mudança.
 */
function proximaPagina(next: string, busca: URLSearchParams) {
  if (next.startsWith('http') || next.startsWith('/')) return next
  if (next.startsWith('?')) return `/v2/transactions${next}`
  const proxima = new URLSearchParams(busca)
  proxima.set('after', next)
  return `/v2/transactions?${proxima}`
}

/** Teto de páginas: uma conta com anos de histórico cabe muito antes disso */
const MAXIMO_DE_PAGINAS = 200

/**
 * Lançamentos de uma conta, do `from` para cá.
 *
 * A paginação é por cursor (`/v2/transactions`): a resposta traz o endereço da página
 * seguinte e a gente segue até ele vir vazio. O endereço por número de página foi aposentado
 * pelo Pluggy — ele responde 410 e manda usar este.
 */
export async function buscarLancamentos(
  credenciais: Credenciais,
  accountId: string,
  from: string,
  to?: string,
) {
  const apiKey = await apiKeyDe(credenciais)
  const lancamentos: PluggyTransaction[] = []

  const busca = new URLSearchParams({ accountId, dateFrom: from })
  if (to) busca.set('dateTo', to)
  let caminho = `/v2/transactions?${busca}`

  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS && caminho; pagina += 1) {
    const { results, next } = await pedir<{
      results: LancamentoResposta[]
      next: string | null
    }>(caminho, { apiKey })

    for (const item of results) {
      lancamentos.push({
        externalId: item.id,
        date: item.date.slice(0, 10),
        amountCents: centavosDe(item),
        description: (item.description || item.descriptionRaw || 'Lançamento').trim(),
        kind: item.category ?? item.paymentData?.paymentMethod ?? null,
        installment: parcelaDe(item),
        merchant: item.merchant?.name?.trim() || null,
        raw: item as unknown as Record<string, unknown>,
      })
    }

    caminho = next ? proximaPagina(next, busca) : ''
  }

  return lancamentos
}

/*
 * A parcela, quando o banco conta que é uma.
 *
 * O Pluggy manda "2 de 10" em `creditCardMetadata`, e alguns bancos mandam junto a data da
 * compra. Quando não mandam, ela é calculada: a parcela 2 que caiu em setembro veio de uma
 * compra de agosto. O mês acerta; o dia é o mesmo da parcela, que é o melhor palpite
 * possível — e o campo diz qual dos dois caminhos foi usado.
 */
function parcelaDe(item: LancamentoResposta): PluggyTransaction['installment'] {
  const meta = item.creditCardMetadata
  /*
   * O campo estruturado é o melhor caminho, mas nem todo banco preenche — e vários escrevem
   * "PARC 02/10" na própria descrição, que é de onde o extrato OFX já lia. Quando o campo
   * falta, a descrição vale: perder a parcela por falta de um campo seria desperdício.
   */
  const doTexto = lerParcelaDoTexto(`${item.description} ${item.descriptionRaw ?? ''}`)
  const number = meta?.installmentNumber ?? doTexto?.number ?? 0
  const count = meta?.totalInstallments ?? doTexto?.count ?? 0
  if (number < 1 || count < 2) return null

  const doBanco = meta?.purchaseDate?.slice(0, 10)
  if (doBanco) {
    return { number, count, purchaseDate: doBanco, purchaseDateFromBank: true }
  }
  return {
    number,
    count,
    purchaseDate: mesesAtras(item.date.slice(0, 10), number - 1),
    purchaseDateFromBank: false,
  }
}

/** "2026-09-14" menos 1 mês → "2026-08-14" (o último dia do mês quando não existe o dia) */
function mesesAtras(date: string, quantos: number) {
  const [ano, mes, dia] = date.split('-').map(Number)
  const base = new Date(Date.UTC(ano ?? 1970, (mes ?? 1) - 1 - quantos, 1))
  const ultimoDia = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0),
  ).getUTCDate()
  base.setUTCDate(Math.min(dia ?? 1, ultimoDia))
  return base.toISOString().slice(0, 10)
}
