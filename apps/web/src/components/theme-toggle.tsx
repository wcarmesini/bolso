import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/use-theme'
import { IconButton } from './icon-button'

export function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const isDark = theme === 'dark'

  return (
    <IconButton
      label={isDark ? 'Usar tema claro' : 'Usar tema escuro'}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </IconButton>
  )
}
