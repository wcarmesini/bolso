import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { settingsSections } from '@/lib/settings-sections'

/**
 * Computador: lista lateral discreta; a seção ativa ganha texto forte e uma linha fina à esquerda.
 * Celular: vira a tela inicial dos Ajustes, em cartão com descrição e seta.
 */
export function SettingsNav() {
  return (
    <nav aria-label="Seções dos ajustes">
      <ul className="divide-y overflow-hidden rounded-xl border bg-card md:divide-y-0 md:rounded-none md:border-0 md:bg-transparent">
        {settingsSections.map(({ to, title, description, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="group flex items-center gap-3 px-4 py-3.5 text-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 md:border-transparent md:border-l-2 md:px-3 md:py-2 md:text-muted-foreground md:hover:text-foreground md:data-[status=active]:border-foreground md:data-[status=active]:text-foreground"
            >
              <Icon className="size-5 shrink-0 text-muted-foreground md:size-4 md:text-current" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-sm md:font-normal md:group-data-[status=active]:font-medium">
                  {title}
                </span>
                <span className="block truncate text-muted-foreground text-xs md:hidden">
                  {description}
                </span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground md:hidden" />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
