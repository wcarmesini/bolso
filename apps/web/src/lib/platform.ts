const isApple = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)

// Rótulo do atalho da busca: ⌘K no Mac, Ctrl K no Windows/Linux
export const searchShortcutLabel = isApple ? '⌘K' : 'Ctrl K'

// Remove acentos para a busca achar "orcamento" em "Orçamento"
export function stripAccents(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}
