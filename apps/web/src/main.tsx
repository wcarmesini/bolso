import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { APP_SCROLL_ID } from './lib/layout'
import { queryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'
// Carregado cedo para capturar o evento de instalação antes do React montar
import './lib/install'
import './styles.css'

const router = createRouter({
  routeTree,
  // As rotas usam o cache para checar a sessão antes de mostrar a tela
  context: { queryClient },
  defaultPreload: 'intent',
  scrollRestoration: true,
  // Quem rola é a área de conteúdo do AppShell, não a janela: volta ao topo ao trocar de tela
  scrollToTopSelectors: [`#${APP_SCROLL_ID}`],
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Elemento #root não encontrado')

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
