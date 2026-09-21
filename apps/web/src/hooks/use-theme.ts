import { useSyncExternalStore } from 'react'
import { applyTheme, getTheme, subscribeTheme } from '@/lib/theme'

export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getTheme)
  return [theme, applyTheme] as const
}
