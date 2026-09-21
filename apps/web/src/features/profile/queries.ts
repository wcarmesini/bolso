import type { Me } from '@bolso/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMe } from '@/features/auth/queries'
import { updateProfile } from './api'

// Enquanto o nome não carregou (ou está vazio), a interface mostra "Você"
export const DEFAULT_DISPLAY_NAME = 'Você'

export function useProfile() {
  const { data, isPending } = useMe()
  return {
    name: data?.user.name ?? '',
    photo: data?.user.image ?? null,
    isPending,
  }
}

export function useDisplayName() {
  return useProfile().name || DEFAULT_DISPLAY_NAME
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (me: Me) => queryClient.setQueryData(['me'], me),
  })
}
