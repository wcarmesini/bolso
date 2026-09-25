import type { ContactFormValues } from '@bolso/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createContact, deleteContact, listContacts, updateContact } from './api'

const queryKey = ['contacts']

export function useContacts() {
  return useQuery({ queryKey, queryFn: listContacts })
}

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey })
    // O nome do contato aparece nos lançamentos
    void queryClient.invalidateQueries({ queryKey: ['transactions'] })
  }
}

export function useSaveContact() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: ({ id, values }: { id?: string; values: ContactFormValues }) =>
      id ? updateContact(id, values) : createContact(values),
    onSuccess: invalidate,
  })
}

export function useDeleteContact() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: deleteContact, onSuccess: invalidate })
}
