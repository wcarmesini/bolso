import type { ButtonHTMLAttributes } from 'react'

// Compartilhado com links que têm cara de botão de ícone (ex.: engrenagem de Ajustes)
export const iconButtonClassName =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-100 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[status=active]:text-foreground md:size-8'

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
}

export function IconButton({ label, className, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={className ? `${iconButtonClassName} ${className}` : iconButtonClassName}
      {...props}
    />
  )
}
