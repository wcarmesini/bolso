import type { RealtimeEvent, RealtimeResource } from '@bolso/shared'
import type { QueryClient } from '@tanstack/react-query'

// Cada aviso do servidor recarrega as telas que dependem daquele dado. Os relatórios dependem
// de quase tudo; a conta mexe nos lançamentos porque mudar o fechamento do cartão muda faturas.
const queryKeysByResource: Record<RealtimeResource, string[][]> = {
  categories: [['categories'], ['reports']],
  accounts: [['accounts'], ['transactions']],
  'integration-keys': [['integration-keys']],
  transactions: [['transactions'], ['reports']],
  budgets: [['budgets'], ['reports']],
  group: [['me'], ['group-members'], ['group-invitations'], ['reports']],
}

const PING_INTERVAL_MS = 25_000
const FIRST_RETRY_MS = 1_000
const MAX_RETRY_MS = 30_000
// O servidor fecha com este código quando não há sessão válida
const UNAUTHORIZED = 4401

/**
 * Conexão de tempo real com o grupo ativo.
 *
 * O servidor só avisa o que mudou; quem busca os dados é o TanStack Query. Se a conexão cair
 * (rede instável, celular em segundo plano), ela volta sozinha e recarrega tudo, para não
 * ficar faltando nada que aconteceu enquanto estava fora.
 */
export function connectRealtime(queryClient: QueryClient) {
  let socket: WebSocket | undefined
  let retryDelay = FIRST_RETRY_MS
  let retryTimer: number | undefined
  let pingTimer: number | undefined
  let stopped = false

  const invalidate = (resources: RealtimeResource[]) => {
    for (const resource of resources) {
      for (const queryKey of queryKeysByResource[resource] ?? []) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
  }

  const connect = () => {
    if (stopped || socket) return
    const url = new URL('/api/ws', window.location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(url)
    socket = ws

    ws.addEventListener('open', () => {
      retryDelay = FIRST_RETRY_MS
      // Voltou de uma queda: recarrega tudo, porque avisos podem ter se perdido
      void queryClient.invalidateQueries()
      pingTimer = window.setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
      }, PING_INTERVAL_MS)
    })

    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      try {
        const message: RealtimeEvent = JSON.parse(event.data)
        if (message.type === 'invalidate') invalidate(message.resources)
      } catch {
        // Mensagem inesperada: ignora
      }
    })

    ws.addEventListener('close', (event) => {
      window.clearInterval(pingTimer)
      socket = undefined
      if (stopped) return
      // Sem sessão: não adianta reconectar; as rotas do app mandam para o login
      if (event.code === UNAUTHORIZED) return
      retryTimer = window.setTimeout(connect, retryDelay)
      retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS)
    })

    ws.addEventListener('error', () => ws.close())
  }

  // O iOS derruba a conexão quando o app vai para segundo plano: ao voltar, reconecta
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !socket) {
      window.clearTimeout(retryTimer)
      retryDelay = FIRST_RETRY_MS
      connect()
    }
  }

  connect()
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onVisible)

  return () => {
    stopped = true
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onVisible)
    window.clearTimeout(retryTimer)
    window.clearInterval(pingTimer)
    socket?.close()
  }
}
