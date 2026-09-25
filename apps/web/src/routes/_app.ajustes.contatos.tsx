import { createFileRoute } from '@tanstack/react-router'
import { ContactsSettings } from '@/features/contacts/components/contacts-settings'

export const Route = createFileRoute('/_app/ajustes/contatos')({
  component: ContactsSettings,
})
