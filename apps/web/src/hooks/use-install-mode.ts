import { useSyncExternalStore } from 'react'
import { getInstallMode, subscribeInstallMode } from '@/lib/install'

export function useInstallMode() {
  return useSyncExternalStore(subscribeInstallMode, getInstallMode)
}
