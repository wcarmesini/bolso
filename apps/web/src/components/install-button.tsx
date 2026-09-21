import { Download } from 'lucide-react'
import { useState } from 'react'
import { promptInstall } from '@/lib/install'

export function InstallButton() {
  const [busy, setBusy] = useState(false)

  const install = async () => {
    setBusy(true)
    try {
      await promptInstall()
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={install}
      disabled={busy}
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      <Download className="size-4" />
      Instalar app
    </button>
  )
}
