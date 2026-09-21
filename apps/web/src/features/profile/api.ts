import type { Me, UpdateProfileInput } from '@bolso/shared'
import { api } from '@/lib/api-client'

// O perfil faz parte de /api/me: nome e foto ficam na conta, e o grupo inteiro vê
export function updateProfile(input: UpdateProfileInput) {
  return api<Me>('/me', { method: 'PATCH', body: input })
}
