import { createFileRoute } from '@tanstack/react-router'
import { ProfileSettings } from '@/features/profile/components/profile-settings'

export const Route = createFileRoute('/_app/ajustes/perfil')({
  component: ProfileSettings,
})
