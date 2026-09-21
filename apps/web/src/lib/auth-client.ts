import { organizationClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

// Conversa com /api/auth (mesmo endereço do app). Grupos = organizações do Better Auth.
export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [organizationClient()],
})
