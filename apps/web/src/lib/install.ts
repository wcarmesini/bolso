// Evento não padronizado (Chrome, Edge, Samsung Internet) que permite abrir o convite de instalação
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

/**
 * - installed: já está rodando como app instalado
 * - prompt: o navegador permite abrir o convite de instalação (Android, desktop)
 * - ios: iPhone/iPad, onde a instalação é manual pelo menu Compartilhar
 * - unavailable: navegador sem suporte (ex.: Firefox desktop)
 */
export type InstallMode = 'installed' | 'prompt' | 'ios' | 'unavailable'

function isStandalone() {
  const iosStandalone = 'standalone' in navigator && navigator.standalone === true
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches
}

function isIos() {
  const ua = navigator.userAgent
  // iPadOS se identifica como Mac, mas tem tela de toque
  return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
let installed = isStandalone()
const listeners = new Set<() => void>()

function computeMode(): InstallMode {
  if (installed) return 'installed'
  if (deferredPrompt) return 'prompt'
  if (isIos()) return 'ios'
  return 'unavailable'
}

let mode = computeMode()

function emit() {
  mode = computeMode()
  for (const listener of listeners) listener()
}

// Registrado no carregamento do módulo: o evento pode disparar antes do React montar
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  deferredPrompt = event
  emit()
})

window.addEventListener('appinstalled', () => {
  deferredPrompt = null
  installed = true
  emit()
})

export function subscribeInstallMode(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getInstallMode() {
  return mode
}

export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return false
  // O evento só pode ser usado uma vez
  deferredPrompt = null
  await event.prompt()
  const { outcome } = await event.userChoice
  emit()
  return outcome === 'accepted'
}
