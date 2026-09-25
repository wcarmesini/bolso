import { type Contact, contactKindLabels } from '@bolso/shared'
import { Building2, Contact2, Plus, UserRound } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDeleteDialog } from '@/components/confirm-delete-dialog'
import { EmptyState } from '@/components/empty-state'
import { RowActions } from '@/components/row-actions'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { useContacts, useDeleteContact } from '../queries'
import { ContactFormDialog } from './contact-form-dialog'

export function ContactsSettings() {
  const { data: contacts = [], isPending, isError } = useContacts()
  const deleteContact = useDeleteContact()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [deleting, setDeleting] = useState<Contact | null>(null)

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <>
      <SectionHeader
        title="Contatos"
        description="Quem recebe ou paga. Serve para saber quanto já foi para cada um."
        action={
          <Button onClick={openNew}>
            <Plus />
            Novo contato
          </Button>
        }
      />

      {isError ? (
        <p className="text-destructive text-sm">Não foi possível carregar os contatos.</p>
      ) : isPending ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : contacts.length === 0 ? (
        <EmptyState
          icon={Contact2}
          title="Nenhum contato ainda"
          text="Cadastre o mercado, a escola, o cliente — e escolha no lançamento."
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {contacts.map((contact) => {
            const Icon = contact.kind === 'person' ? UserRound : Building2
            const detalhes = [contactKindLabels[contact.kind], contact.document, contact.notes]
              .filter(Boolean)
              .join(' · ')
            return (
              <li
                key={contact.id}
                className="group/row relative flex items-center gap-3 py-2.5 pr-4 pl-4"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{contact.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">{detalhes}</span>
                </span>
                <RowActions
                  itemName={contact.name}
                  onEdit={() => {
                    setEditing(contact)
                    setFormOpen(true)
                  }}
                  onDelete={() => setDeleting(contact)}
                />
              </li>
            )
          })}
        </ul>
      )}

      <ContactFormDialog open={formOpen} onOpenChange={setFormOpen} contact={editing} />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title={`Excluir “${deleting?.name ?? ''}”?`}
        description="Os lançamentos dele continuam, só ficam sem contato."
        successMessage="Contato excluído"
        onConfirm={async () => {
          if (deleting) await deleteContact.mutateAsync(deleting.id)
        }}
      />
    </>
  )
}
