import { CircleCheck } from 'lucide-react'
import { useInstallMode } from '@/hooks/use-install-mode'
import { InstallButton } from './install-button'
import { IosInstallSteps } from './ios-install-steps'

export function InstallCard() {
  const mode = useInstallMode()

  if (mode === 'installed') {
    return (
      <p className="flex items-center gap-2 text-sm">
        <CircleCheck className="size-5 text-primary" />
        Você está usando o app instalado.
      </p>
    )
  }

  if (mode === 'prompt') {
    return (
      <div>
        <InstallButton />
      </div>
    )
  }

  if (mode === 'ios') return <IosInstallSteps />

  return (
    <p className="text-muted-foreground text-sm">
      Se ainda não instalou, abra o Bolso no <strong className="text-foreground">Chrome</strong> ou{' '}
      <strong className="text-foreground">Edge</strong> (Android e computador) ou no{' '}
      <strong className="text-foreground">Safari</strong> (iPhone). No Safari do Mac, use{' '}
      <strong className="text-foreground">Arquivo → Adicionar ao Dock</strong>.
    </p>
  )
}
