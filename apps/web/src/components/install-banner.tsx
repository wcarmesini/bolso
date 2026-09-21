import { X } from 'lucide-react'
import { useState } from 'react'
import { useInstallMode } from '@/hooks/use-install-mode'
import { InstallButton } from './install-button'
import { IosInstallSteps } from './ios-install-steps'

const DISMISS_KEY = 'bolso:install-dismissed-at'
const DISMISS_DAYS = 14

function wasDismissedRecently() {
  try {
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY))
    return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000
  } catch {
    return false
  }
}

export function InstallBanner() {
  const mode = useInstallMode()
  const [dismissed, setDismissed] = useState(wasDismissedRecently)

  if (dismissed || (mode !== 'prompt' && mode !== 'ios')) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch {
      // Sem armazenamento: dispensa só nesta sessão
    }
    setDismissed(true)
  }

  return (
    <section className="relative flex gap-3 rounded-2xl border bg-card p-4">
      <img src="/pwa-64x64.png" alt="" className="size-11 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pr-8">
        <div>
          <p className="font-semibold">Instale o Bolso</p>
          <p className="text-muted-foreground text-sm">
            Abra direto da tela inicial, em tela cheia.
          </p>
        </div>
        {mode === 'prompt' ? (
          <div>
            <InstallButton />
          </div>
        ) : (
          <IosInstallSteps />
        )}
      </div>
      <button
        type="button"
        aria-label="Dispensar"
        onClick={dismiss}
        className="absolute top-2 right-2 grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </section>
  )
}
