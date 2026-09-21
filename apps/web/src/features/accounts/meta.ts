import { type AccountType, accountTypeLabels } from '@bolso/shared'
import { CreditCard, Landmark, type LucideIcon, PiggyBank, TrendingUp, Wallet } from 'lucide-react'

const icons: Record<AccountType, LucideIcon> = {
  checking: Landmark,
  savings: PiggyBank,
  credit_card: CreditCard,
  cash: Wallet,
  investment: TrendingUp,
}

// Junta o rótulo (vem do pacote compartilhado) com o ícone (só faz sentido na interface)
export const accountTypeMeta = Object.fromEntries(
  Object.entries(accountTypeLabels).map(([type, label]) => [
    type,
    { label, icon: icons[type as AccountType] },
  ]),
) as Record<AccountType, { label: string; icon: LucideIcon }>
