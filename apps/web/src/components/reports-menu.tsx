import { Link } from '@tanstack/react-router'
import { NavigationMenuLink } from '@/components/ui/navigation-menu'
import { reports } from '@/lib/reports'

export function ReportsMenu() {
  return (
    <ul className="grid w-[30rem] grid-cols-2 gap-1">
      {reports.map(({ slug, title, description, icon: Icon }) => (
        <li key={slug}>
          <NavigationMenuLink
            closeOnClick
            render={<Link to="/relatorios/$slug" params={{ slug }} />}
            className="flex-col items-start gap-1 rounded-md p-3"
          >
            <span className="flex items-center gap-2 font-medium text-sm">
              <Icon className="size-4 text-muted-foreground" />
              {title}
            </span>
            <span className="text-muted-foreground text-xs leading-snug">{description}</span>
          </NavigationMenuLink>
        </li>
      ))}
    </ul>
  )
}
