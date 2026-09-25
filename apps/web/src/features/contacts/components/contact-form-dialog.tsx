import {
  type Contact,
  type ContactFormValues,
  contactFormSchema,
  contactKindLabels,
  contactKinds,
  isContactKind,
} from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { useSaveContact } from '../queries'

const emptyValues: ContactFormValues = { name: '', kind: 'company', document: '', notes: '' }

type ContactFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ausente = contato novo */
  contact?: Contact | null
  /** Nome sugerido (ex.: veio da descrição de um lançamento importado) */
  suggestedName?: string
  onSaved?: (contact: Contact) => void
}

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  suggestedName,
  onSaved,
}: ContactFormDialogProps) {
  const saveContact = useSaveContact()

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      contact
        ? {
            name: contact.name,
            kind: contact.kind,
            document: contact.document,
            notes: contact.notes,
          }
        : { ...emptyValues, name: suggestedName ?? '' },
    )
  }, [open, contact, suggestedName, form])

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await saveContact.mutateAsync({ id: contact?.id, values })
      onOpenChange(false)
      onSaved?.(saved)
      toast.success(contact ? 'Contato atualizado' : 'Contato criado')
    } catch (cause) {
      if (cause instanceof FieldValidationError) {
        form.setError(cause.field as keyof ContactFormValues, { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível salvar.'))
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{contact ? 'Editar contato' : 'Novo contato'}</DialogTitle>
            <DialogDescription>Quem recebe ou paga: mercado, escola, cliente.</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor="contact-name">Nome</FieldLabel>
              <Input
                id="contact-name"
                placeholder="Ex.: Mercado São José"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel>Tipo</FieldLabel>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    value={[field.value]}
                    onValueChange={(next) => {
                      if (isContactKind(next[0])) field.onChange(next[0])
                    }}
                    className="w-full"
                  >
                    {contactKinds.map((kind) => (
                      <ToggleGroupItem key={kind} value={kind} className="flex-1">
                        {contactKindLabels[kind]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.document)}>
              <FieldLabel htmlFor="contact-document">CPF ou CNPJ</FieldLabel>
              <Input
                id="contact-document"
                placeholder="Opcional"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.document)}
                {...form.register('document')}
              />
              <FieldError errors={[form.formState.errors.document]} />
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.notes)}>
              <FieldLabel htmlFor="contact-notes">Observação</FieldLabel>
              <Input
                id="contact-notes"
                placeholder="Opcional"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.notes)}
                {...form.register('notes')}
              />
              <FieldError errors={[form.formState.errors.notes]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
