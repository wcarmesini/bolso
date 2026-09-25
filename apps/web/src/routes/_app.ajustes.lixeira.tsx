import { createFileRoute } from '@tanstack/react-router'
import { TrashSettings } from '@/features/transactions/components/trash-settings'

export const Route = createFileRoute('/_app/ajustes/lixeira')({
  component: TrashSettings,
})
