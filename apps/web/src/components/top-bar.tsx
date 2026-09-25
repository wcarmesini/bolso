import { Link, useMatchRoute } from '@tanstack/react-router'
import { Search } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { InboxBadge } from '@/features/bank/components/inbox-badge'
import { useSearchShortcut } from '@/hooks/use-search-shortcut'
import { navItems, reportsNavItem } from '@/lib/nav'
import { searchShortcutLabel } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { AccountMenu } from './account-menu'
import { IconButton } from './icon-button'
import { ReportsMenu } from './reports-menu'
import { ThemeToggle } from './theme-toggle'

// A paleta (cmdk + diálogo) fica fora do pacote inicial para o app abrir leve
const loadCommandMenu = () => import('./command-menu')
const CommandMenu = lazy(() =>
  loadCommandMenu().then((module) => ({ default: module.CommandMenu })),
)

// Tempo depois da abertura para baixar a paleta em segundo plano
const PREFETCH_DELAY_MS = 2000

// Tamanho padrão do shadcn, visual clean: a aba ativa se distingue só pela cor do texto.
// `bg-transparent!` anula todos os fundos do shadcn (hover, foco após clique, menu aberto),
// que davam aparência de botão pressionado. O anel de foco do teclado continua.
const navLinkClassName =
  'bg-transparent! text-muted-foreground transition-colors hover:text-foreground data-[status=active]:text-foreground'

export function TopBar() {
  const matchRoute = useMatchRoute()
  const isReportsActive = Boolean(matchRoute({ to: reportsNavItem.to, fuzzy: true }))
  const [searchOpen, setSearchOpen] = useState(false)
  // Depois de carregada, a paleta fica montada para a animação de fechar funcionar
  const [searchLoaded, setSearchLoaded] = useState(false)

  const openSearch = useCallback(() => {
    setSearchLoaded(true)
    setSearchOpen(true)
  }, [])

  const toggleSearch = useCallback(() => {
    setSearchLoaded(true)
    setSearchOpen((open) => !open)
  }, [])

  useSearchShortcut(toggleSearch)

  // Depois que a tela carregou, baixa a paleta em segundo plano: assim o primeiro Ctrl K
  // já abre pronto e não perde o que a pessoa começou a digitar
  useEffect(() => {
    const timer = window.setTimeout(() => void loadCommandMenu(), PREFETCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <header className="shrink-0 border-b bg-card pt-safe">
      <div className="mx-auto flex h-12 max-w-5xl items-center gap-4 px-4 md:px-6">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 font-semibold text-[15px] text-foreground tracking-tight"
        >
          <img src="/logo.svg" alt="" className="size-6" />
          Bolso
        </Link>

        <span aria-hidden className="hidden h-5 w-px shrink-0 bg-border md:block" />

        {/* No celular, as mesmas abas ficam na barra inferior */}
        <NavigationMenu aria-label="Principal" className="hidden md:flex">
          <NavigationMenuList className="gap-1">
            {navItems.map(({ to, label }) => (
              <NavigationMenuItem key={to}>
                <NavigationMenuLink
                  render={<Link to={to} activeOptions={{ exact: to === '/' }} />}
                  className={cn(navigationMenuTriggerStyle(), navLinkClassName)}
                >
                  {label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  navLinkClassName,
                  'data-popup-open:text-foreground',
                  isReportsActive && 'text-foreground',
                )}
              >
                {reportsNavItem.label}
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ReportsMenu />
              </NavigationMenuContent>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="ml-auto flex items-center gap-1">
          {/* Aparece só quando o banco trouxe algo que ainda espera aprovação */}
          <InboxBadge />

          {/* Só a lupa, sem campo na barra: a busca abre no centro da tela de qualquer forma */}
          <IconButton
            label="Buscar"
            title={`Buscar (${searchShortcutLabel})`}
            aria-keyshortcuts="Control+K Meta+K"
            onClick={openSearch}
          >
            <Search className="size-4" />
          </IconButton>
          <ThemeToggle />
          <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />
          <AccountMenu />
        </div>
      </div>

      {searchLoaded && (
        <Suspense fallback={null}>
          <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}
    </header>
  )
}
