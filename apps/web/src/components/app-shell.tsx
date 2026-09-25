import { Outlet } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useRealtime } from '@/hooks/use-realtime'
import { APP_SCROLL_ID } from '@/lib/layout'
import { TabBar } from './tab-bar'
import { TopBar } from './top-bar'

/*
 * A tela não rola inteira: só o conteúdo entre a barra superior e as abas.
 * Assim a barra de rolagem começa abaixo do menu, e o espaço reservado para ela
 * (`both-edges`, dos dois lados para o conteúdo seguir centralizado com o menu)
 * fica no fundo do conteúdo, sem abrir lacuna na barra superior.
 *
 * Sem `children`, mostra a rota atual; com `children`, mostra o conteúdo recebido (ex.: 404).
 */
export function AppShell({ children }: { children?: ReactNode }) {
  // O que outra pessoa do orçamento gravar aparece aqui sozinho
  useRealtime()

  return (
    <div className="flex h-dvh flex-col">
      <TopBar />
      <main
        id={APP_SCROLL_ID}
        data-scroll-restoration-id={APP_SCROLL_ID}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable_both-edges]"
      >
        <div className="mx-auto max-w-5xl pb-6 md:pb-12">{children ?? <Outlet />}</div>
      </main>
      <TabBar />
    </div>
  )
}
