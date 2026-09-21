import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { LoginPage } from '@/features/auth/components/login-page'
import { meQuery } from '@/features/auth/queries'
import { UnauthorizedError } from '@/lib/api-client'

// "continuar" guarda a tela que a pessoa tentou abrir antes de entrar;
// "error" vem do provedor quando a entrada não foi concluída (ver auth.ts: onAPIError)
const searchSchema = z.object({
  continuar: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/entrar')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, search }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery)
      // Já está logado: não faz sentido ficar na tela de login
      throw redirect({ to: search.continuar ?? '/' })
    } catch (error) {
      if (error instanceof UnauthorizedError) return
      throw error
    }
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { continuar, error } = Route.useSearch()
  return <LoginPage continueTo={continuar ?? '/'} error={error} />
}
