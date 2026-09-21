import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { NotFound } from '@/components/not-found'
import { Toaster } from '@/components/ui/sonner'

// Avisos flutuantes: aparecem por cima de tudo, logo abaixo da barra superior, e somem sozinhos
const TOAST_OFFSET = { top: 'calc(3.75rem + env(safe-area-inset-top))' }

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster position="top-center" offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} />
    </>
  )
}

// O cache fica no contexto para as rotas poderem carregar dados antes de mostrar a tela
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootLayout,
  // Endereço inexistente: mostra o aviso dentro do layout do app, com barra e abas
  notFoundComponent: () => (
    <AppShell>
      <NotFound />
    </AppShell>
  ),
})
