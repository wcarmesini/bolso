import { z } from 'zod'

export const profileNameSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome').max(60, 'Use até 60 caracteres'),
})
export type ProfileNameValues = z.infer<typeof profileNameSchema>

// Foto já recortada e reduzida no navegador (256×256 JPEG, poucos KB), enviada como data URL
export const profilePhotoSchema = z.string().startsWith('data:image/').max(400_000)

export const updateProfileInputSchema = z.object({
  name: profileNameSchema.shape.name.optional(),
  image: profilePhotoSchema.nullable().optional(),
})
export type UpdateProfileInput = z.infer<typeof updateProfileInputSchema>

export const groupRoles = ['owner', 'admin', 'member'] as const
export type GroupRole = (typeof groupRoles)[number]

export type Me = {
  user: { id: string; name: string; email: string; image: string | null }
  activeGroup: { id: string; name: string; role: GroupRole } | null
  /** Todos os orçamentos de que a pessoa participa, com quantas pessoas cada um tem */
  groups: { id: string; name: string; role: GroupRole; members: number }[]
}

export type GroupMember = {
  id: string
  userId: string
  name: string
  email: string
  image: string | null
  role: GroupRole
}

export const inviteInputSchema = z.object({ email: z.email('E-mail inválido') })

export const createGroupInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(40, 'Use até 40 caracteres'),
})
