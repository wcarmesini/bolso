import { createFileRoute } from '@tanstack/react-router'
import { IntegrationsSettings } from '@/features/integrations/components/integrations-settings'

export const Route = createFileRoute('/_app/ajustes/integracoes')({
  component: IntegrationsSettings,
})
