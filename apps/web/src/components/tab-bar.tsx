import { Link } from '@tanstack/react-router'
import { navItems, reportsNavItem } from '@/lib/nav'

const tabs = [...navItems, reportsNavItem]

export function TabBar() {
  return (
    <nav
      aria-label="Principal"
      className="grid shrink-0 grid-cols-4 border-t bg-card pb-safe md:hidden"
    >
      {tabs.map(({ to, label, icon: Icon }) => (
        <Link
          key={to}
          to={to}
          activeOptions={{ exact: to === '/' }}
          className="flex h-14 select-none flex-col items-center justify-center gap-1 font-medium text-[11px] text-muted-foreground transition-colors duration-100 data-[status=active]:text-foreground"
        >
          <Icon className="size-5" strokeWidth={1.75} />
          {label}
        </Link>
      ))}
    </nav>
  )
}
