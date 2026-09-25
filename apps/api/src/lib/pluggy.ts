import type { BankAccountOption } from '@bolso/shared'
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
  id: string
  description: string
  descriptionRaw?: string | null
  amount: number
  date: string
  type?: 'DEBIT' | 'CREDIT'
  status?: string
  category?: string | null
  paymentData?: { paymentMethod?: string | null } | null
}

export type PluggyTransaction = {
  externalId: string
  date: string
  /** Negativo = saída, igual ao extrato OFX */
  amountCents: number
  description: string
  kind: string | null
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
      })
    }

    caminho = next ? proximaPagina(next, busca) : ''
  }

  return lancamentos
}
