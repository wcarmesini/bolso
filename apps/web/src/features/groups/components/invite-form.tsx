import { inviteInputSchema } from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { useGroupInvitations, useInviteToGroup } from '../queries'

type InviteValues = { email: string }

/**
 * Convida pelo e-mail e devolve um link para compartilhar (WhatsApp, etc.).
 * Quando houver envio de e-mail, o link continua valendo: o convite é o mesmo.
 */
export function InviteForm() {
  const invite = useInviteToGroup()
  const { data: pending = [] } = useGroupInvitations()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteInputSchema),
    defaultValues: { email: '' },
  })

  const submit = form.handleSubmit(async (values) => {
    try {
      const created = await invite.mutateAsync(values.email)
      form.reset({ email: '' })
      await copy(created.id, created.link)
      toast.success('Convite criado e link copiado')
    } catch (cause) {
      if (cause instanceof FieldValidationError) {
        form.setError('email', { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível convidar.'))
      }
    }
  })

  const copy = async (id: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiedId(id)
      window.setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000)
    } catch {
      toast.info(link)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field data-invalid={Boolean(form.formState.errors.email)} className="flex-1">
          <FieldLabel htmlFor="invite-email">Convidar pelo e-mail</FieldLabel>
          <Input
            id="invite-email"
            type="email"
            placeholder="pessoa@exemplo.com"
            autoComplete="off"
            aria-invalid={Boolean(form.formState.errors.email)}
            {...form.register('email')}
          />
          <FieldError errors={[form.formState.errors.email]} />
        </Field>
        <Button type="submit" disabled={form.formState.isSubmitting} className="sm:mt-6">
          <UserPlus />
          {form.formState.isSubmitting ? 'Criando…' : 'Convidar'}
        </Button>
      </form>

      {pending.length > 0 && (
        <ul className="divide-y rounded-xl border bg-card">
          {pending.map((invitation) => (
            <li key={invitation.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{invitation.email}</span>
                <span className="block text-muted-foreground text-xs">Convite pendente</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => copy(invitation.id, invitation.link)}
              >
                {copiedId === invitation.id ? <Check /> : <Copy />}
                {copiedId === invitation.id ? 'Copiado' : 'Copiar link'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
