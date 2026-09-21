import { QueryClient } from '@tanstack/react-query'
import { UnauthorizedError } from './api-client'

/*
 * Cache das telas. Quem avisa que algo mudou é o WebSocket (lib/realtime.ts), então não é
 * preciso ficar buscando de tempos em tempos. O `staleTime` curto cobre o intervalo entre
 * a volta de uma queda de conexão e o próximo aviso.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: (failureCount, error) => {
        // Sessão expirada: não adianta insistir; a rota manda para o login
        if (error instanceof UnauthorizedError) return false
        return failureCount < 2
      },
    },
  },
})
