import type { Contact, ContactFormValues } from '@bolso/shared'
import { api } from '@/lib/api-client'

// Camada única de dados dos contatos: só este arquivo conhece a API
export function listContacts() {
  return api<Contact[]>('/contacts')
}

export function createContact(values: ContactFormValues) {
  return api<Contact>('/contacts', { method: 'POST', body: values })
}

export function updateContact(id: string, values: ContactFormValues) {
  return api<Contact>(`/contacts/${id}`, { method: 'PATCH', body: values })
}

/** Os lançamentos do contato ficam sem contato, não são excluídos */
export function deleteContact(id: string) {
  return api<void>(`/contacts/${id}`, { method: 'DELETE' })
}
