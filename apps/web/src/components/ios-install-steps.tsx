import { Share, SquarePlus } from 'lucide-react'

export function IosInstallSteps() {
  return (
    <ol className="flex flex-col gap-1.5 text-muted-foreground text-sm">
      <li className="flex flex-wrap items-center gap-1.5">
        1. Toque em
        <Share className="size-4 text-foreground" aria-hidden />
        <span className="font-medium text-foreground">Compartilhar</span>
        (no Safari, pode estar no menu •••)
      </li>
      <li className="flex flex-wrap items-center gap-1.5">
        2. Escolha
        <SquarePlus className="size-4 text-foreground" aria-hidden />
        <span className="font-medium text-foreground">Adicionar à Tela de Início</span>
      </li>
    </ol>
  )
}
