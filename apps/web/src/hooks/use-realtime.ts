import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectRealtime } from '@/lib/realtime'

// Mantém a conexão de tempo real enquanto o app estiver aberto
export function useRealtime() {
  const queryClient = useQueryClient()

  useEffect(() => connectRealtime(queryClient), [queryClient])
}
