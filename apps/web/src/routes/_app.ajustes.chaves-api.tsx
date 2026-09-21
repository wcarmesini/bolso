import { createFileRoute } from '@tanstack/react-router'
import { ApiKeysSettings } from '@/features/integrations/components/api-keys-settings'

export const Route = createFileRoute('/_app/ajustes/chaves-api')({
  component: ApiKeysSettings,
})
