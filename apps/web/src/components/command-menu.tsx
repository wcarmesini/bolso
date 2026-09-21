import { useNavigate } from '@tanstack/react-router'
import { Moon, Sun } from 'lucide-react'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useTheme } from '@/hooks/use-theme'
import { navItems, reportsNavItem } from '@/lib/nav'
import { stripAccents } from '@/lib/platform'
import { reports } from '@/lib/reports'
import { settingsSections } from '@/lib/settings-sections'

const pages = [...navItems, reportsNavItem]

type CommandMenuProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const navigate = useNavigate()
  const [theme, setTheme] = useTheme()

  const run = (action: () => void) => {
    onOpenChange(false)
    action()
  }

  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Busca"
      description="Busque telas, relatórios e ações"
    >
      <Command>
        <CommandInput placeholder="Buscar telas, relatórios e ações…" />
        <CommandList>
          <CommandEmpty>Nada encontrado.</CommandEmpty>

          <CommandGroup heading="Ir para">
            {pages.map(({ to, label, icon: Icon }) => (
              <CommandItem
                key={to}
                value={label}
                keywords={[stripAccents(label)]}
                onSelect={() => run(() => navigate({ to }))}
              >
                <Icon />
                {label}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Relatórios">
            {reports.map(({ slug, title, icon: Icon }) => (
              <CommandItem
                key={slug}
                value={title}
                keywords={[stripAccents(title), 'relatorio']}
                onSelect={() => run(() => navigate({ to: '/relatorios/$slug', params: { slug } }))}
              >
                <Icon />
                {title}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Ajustes">
            {settingsSections.map(({ to, title, description, icon: Icon }) => (
              <CommandItem
                key={to}
                value={`Ajustes ${title}`}
                keywords={[
                  stripAccents(title),
                  stripAccents(description),
                  'ajustes',
                  'configuracoes',
                ]}
                onSelect={() => run(() => navigate({ to }))}
              >
                <Icon />
                {title}
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandGroup heading="Preferências">
            <CommandItem
              value="Alternar tema"
              keywords={['tema', 'claro', 'escuro', 'dark', 'light']}
              onSelect={() => run(() => setTheme(nextTheme))}
            >
              {nextTheme === 'light' ? <Sun /> : <Moon />}
              {nextTheme === 'light' ? 'Usar tema claro' : 'Usar tema escuro'}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}
