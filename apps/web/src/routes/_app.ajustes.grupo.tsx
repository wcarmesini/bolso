import { createFileRoute } from '@tanstack/react-router'
import { GroupSettings } from '@/features/groups/components/group-settings'

export const Route = createFileRoute('/_app/ajustes/grupo')({
  component: GroupSettings,
})
