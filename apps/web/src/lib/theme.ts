export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'bolso:theme'

// Precisam bater com as cores de fundo em styles.css e com o script em index.html
const THEME_COLORS: Record<Theme, string> = { dark: '#09090b', light: '#f7f7f8' }

// Estado único do tema: o botão da barra e a paleta de comandos enxergam a mesma troca
const listeners = new Set<() => void>()

export function subscribeTheme(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Sem armazenamento (ex.: navegação privada): o tema vale só para esta sessão
  }
  for (const listener of listeners) listener()
}
