import type { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'
import { centsFromDigits, formatCents } from '@/lib/money'

type MoneyInputProps = Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
  /** Valor em centavos */
  value: number
  onValueChange: (cents: number) => void
}

// Campo de valor em reais: só aceita dígitos, que entram pela direita como em app de banco
export function MoneyInput({ value, onValueChange, className, ...props }: MoneyInputProps) {
  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={formatCents(value)}
      onChange={(event) => onValueChange(centsFromDigits(event.target.value))}
      className={className ? `tabular-nums ${className}` : 'tabular-nums'}
    />
  )
}
