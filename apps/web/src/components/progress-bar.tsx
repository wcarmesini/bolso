/*
 * Barra de uso de um limite. Verde até 80%, âmbar de 80% a 100%, vermelha quando passa.
 * São cores de dado (quanto do orçamento foi usado), como as das categorias.
 */
export function usageTone(ratio: number) {
  if (ratio > 1) return { bar: 'bg-destructive', text: 'text-destructive' }
  if (ratio >= 0.8) return { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' }
  return { bar: 'bg-emerald-500', text: 'text-muted-foreground' }
}

type ProgressBarProps = {
  /** 0 = vazia, 1 = cheia; acima de 1 fica cheia e vermelha */
  ratio: number
  /** Cor fixa, para barras que não são de limite (ex.: comparação entre categorias) */
  className?: string
  label?: string
}

export function ProgressBar({ ratio, className, label }: ProgressBarProps) {
  const width = `${Math.min(Math.max(ratio, 0), 1) * 100}%`
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio * 100)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ${className ?? usageTone(ratio).bar}`}
        style={{ width }}
      />
    </div>
  )
}
