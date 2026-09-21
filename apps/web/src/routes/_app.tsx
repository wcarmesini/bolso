import { createFileRoute, redirect } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { meQuery } from '@/features/auth/queries'

/*
 * Layout das telas do app (barra superior + abas) e porta de entrada: sem sessão válida,
 * manda para /entrar. Telas fora deste layout (login, convite) não têm essa moldura.
 */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    try {
      await context.queryClient.ensureQueryData(meQuery)
    } catch {
      throw redirect({ to: '/entrar', search: { continuar: location.href } })
    }
  },
  component: AppShell,
})
