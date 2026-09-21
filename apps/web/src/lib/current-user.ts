// O nome vem do Perfil (features/profile). Provisório até existir login com Better Auth.
export const ACCOUNT_SUBTITLE = 'Conta local · sem login'

export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.charAt(0) ?? ''
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : ''
  return (first + last).toUpperCase() || '—'
}
