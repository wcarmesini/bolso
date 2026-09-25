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

/*
 * O papel de alguém dentro de um orçamento.
 *
 * `owner` é quem criou: manda em tudo, inclusive em excluir o orçamento e em quem entra.
 * `admin` é herança do Better Auth — edita e cuida das pessoas, mas não exclui o orçamento.
 * `member` e `viewer` são os dois níveis que aparecem ao compartilhar: quem edita e quem só vê.
 */
export const groupRoles = ['owner', 'admin', 'member', 'viewer'] as const
export type GroupRole = (typeof groupRoles)[number]

/** Os níveis que se escolhem ao compartilhar. Dono não se escolhe: é quem criou */
export const accessLevels = ['member', 'viewer'] as const
export type AccessLevel = (typeof accessLevels)[number]

export const roleLabels: Record<GroupRole, string> = {
  owner: 'Dono',
  admin: 'Pode editar',
  member: 'Pode editar',
  viewer: 'Pode ver',
}

export const roleHints: Record<AccessLevel, string> = {
  member: 'Lança, edita e exclui — tudo, menos mexer em quem tem acesso',
  viewer: 'Enxerga tudo e não muda nada',
}

/** A pergunta que o servidor faz antes de deixar gravar qualquer coisa do orçamento */
export const canEdit = (role: GroupRole | undefined) => role !== undefined && role !== 'viewer'

/** Quem convida, muda o nível de alguém e tira o acesso */
export const canManageAccess = (role: GroupRole | undefined) => role === 'owner' || role === 'admin'

export const accessLevelSchema = z.enum(accessLevels)

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

export const inviteInputSchema = z.object({
  email: z.email('E-mail inválido'),
  role: z.enum(accessLevels).default('member'),
})
export type InviteInput = z.infer<typeof inviteInputSchema>

/** Trocar o nível de quem já está dentro */
export const memberRoleSchema = z.object({ role: z.enum(accessLevels) })

export const createGroupInputSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome').max(40, 'Use até 40 caracteres'),
})

/**
 * O que existe dentro de um orçamento.
 *
 * Serve à confirmação antes de excluir: dizer "apaga tudo" é abstrato, dizer "apaga 412
 * lançamentos e 6 contas" é o tamanho real da decisão.
 */
export type GroupContents = {
  id: string
  name: string
  people: number
  accounts: number
  categories: number
  transactions: number
}
