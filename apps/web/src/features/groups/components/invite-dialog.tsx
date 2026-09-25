import { inviteInputSchema } from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, Copy, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/auth/queries'
import { getInitials } from '@/lib/current-user'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { useGroupInvitations, useGroupMembers, useInviteToGroup } from '../queries'

/**
 * Quem compartilha este orçamento, e como convidar mais alguém.
 *
 * As três coisas moram juntas porque são a mesma pergunta — "quem tem acesso a isto?" —, e o
 * convite só faz sentido ao lado da resposta. O e-mail vira um **link**, que a pessoa manda
 * por onde quiser; quando existir envio por e-mail, o link continua valendo.
 */
export function InviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { data: me } = useMe()
  const { data: members = [] } = useGroupMembers()
  const { data: pendentes = [] } = useGroupInvitations()
  const convidar = useInviteToGroup()
  const [copiado, setCopiado] = useState<string | null>(null)

  const form = useForm<{ email: string }>({
    resolver: zodResolver(inviteInputSchema),
    defaultValues: { email: '' },
  })

  const copiar = async (id: string, link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(id)
      window.setTimeout(() => setCopiado((atual) => (atual === id ? null : atual)), 2000)
    } catch {
      toast.info(link)
    }
  }

  const enviar = form.handleSubmit(async (values) => {
    try {
      const criado = await convidar.mutateAsync(values.email)
      form.reset({ email: '' })
      await copiar(criado.id, criado.link)
      toast.success('Convite criado e link copiado')
    } catch (cause) {
      if (cause instanceof FieldValidationError) {
        form.setError('email', { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível convidar.'))
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <div className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Quem compartilha “{me?.activeGroup?.name}”</DialogTitle>
            <DialogDescription>
              Quem entra vê e lança tudo, em tempo real. Não existe meio-acesso.
            </DialogDescription>
          </DialogHeader>

          <ul className="-mx-1 flex flex-col">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-2.5 px-1 py-1.5">
                <Avatar size="sm">
                  {member.image && <AvatarImage src={member.image} alt="" />}
                  <AvatarFallback className="bg-primary font-semibold text-primary-foreground text-xs">
                    {getInitials(member.name)}
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {member.name}
                    {member.userId === me?.user.id && (
                      <span className="text-muted-foreground"> · você</span>
                    )}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {member.email}
                  </span>
                </span>
              </li>
            ))}

            {pendentes.map((convite) => (
              <li key={convite.id} className="flex items-center gap-2.5 px-1 py-1.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <UserPlus className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{convite.email}</span>
                  <span className="block text-muted-foreground text-xs">Convite pendente</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => void copiar(convite.id, convite.link)}
                >
                  {copiado === convite.id ? <Check /> : <Copy />}
                  {copiado === convite.id ? 'Copiado' : 'Copiar link'}
                </Button>
              </li>
            ))}
          </ul>

          <form onSubmit={enviar} className="flex items-start gap-2 border-t pt-4">
            <Field data-invalid={Boolean(form.formState.errors.email)} className="flex-1">
              <FieldLabel htmlFor="invite-email" className="sr-only">
                Convidar pelo e-mail
              </FieldLabel>
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
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <UserPlus />
              {form.formState.isSubmitting ? 'Criando…' : 'Convidar'}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
