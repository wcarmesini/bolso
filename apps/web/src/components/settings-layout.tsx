import { Link, Outlet, useMatchRoute } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { PageHeader } from './page-header'
import { SettingsNav } from './settings-nav'

export function SettingsLayout() {
  const matchRoute = useMatchRoute()
  // Em /ajustes (sem seção): no celular mostra a lista; no computador a rota redireciona para Perfil
  const isIndex = Boolean(matchRoute({ to: '/ajustes' }))

  return (
    <>
      <PageHeader title="Ajustes" />
      <div className="px-4 py-5 md:grid md:grid-cols-[13rem_minmax(0,1fr)] md:gap-10 md:px-6 md:py-6">
        <div className={isIndex ? undefined : 'hidden md:block'}>
          <SettingsNav />
        </div>

        <div className={isIndex ? 'hidden md:block' : 'flex flex-col gap-6'}>
          <Link
            to="/ajustes"
            className="-ml-1 flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground md:hidden"
          >
            <ChevronLeft className="size-4" />
            Ajustes
          </Link>
          <Outlet />
        </div>
      </div>
    </>
  )
}
