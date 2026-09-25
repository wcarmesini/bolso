import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { LoginPage } from '@/features/auth/components/login-page'
import { meQuery } from '@/features/auth/queries'

// "continuar" guarda a tela que a pessoa tentou abrir antes de entrar;
// "error" vem do provedor quando a entrada não foi concluída (ver auth.ts: onAPIError)
const searchSchema = z.object({
  continuar: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/entrar')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context, search }) => {
    /*
     * Não deu para saber quem está logado? Mostra o login — é para onde a pessoa ia de todo
     * jeito. Errar aqui (API reiniciando, rede caindo) não pode virar tela de erro.
     */
    const me = await context.queryClient.ensureQueryData(meQuery).catch(() => null)
    // Já está logado: não faz sentido ficar na tela de login
    if (me) throw redirect({ to: search.continuar ?? '/' })
  },
  component: LoginRoute,
})

function LoginRoute() {
  const { continuar, error } = Route.useSearch()
  return <LoginPage continueTo={continuar ?? '/'} error={error} />
}
