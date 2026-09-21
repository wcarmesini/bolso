import { createFileRoute } from '@tanstack/react-router'
import { AccountsSettings } from '@/features/accounts/components/accounts-settings'

export const Route = createFileRoute('/_app/ajustes/contas')({
  component: AccountsSettings,
})
