import type { GroupRole } from '@bolso/shared'
import { Check, Plus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/auth/queries'
import { getInitials } from '@/lib/current-user'
import { errorMessage } from '@/lib/errors'
import { useActivateGroup, useCreateGroup, useGroupMembers, useRenameGroup } from '../queries'
import { InviteForm } from './invite-form'

const roleLabels: Record<GroupRole, string> = {
  owner: 'Dono',
  admin: 'Administra',
  member: 'Participa',
}

export function GroupSettings() {
  const { data: me } = useMe()
  const { data: members = [], isPending } = useGroupMembers()
  const renameGroup = useRenameGroup()
  const createGroup = useCreateGroup()
  const activateGroup = useActivateGroup()
  const [newGroupName, setNewGroupName] = useState('')

  const activeGroup = me?.activeGroup
  const canManage = activeGroup?.role === 'owner' || activeGroup?.role === 'admin'

  const rename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const name = String(data.get('group-name') ?? '').trim()
    if (!name || name === activeGroup?.name) return
    try {
      await renameGroup.mutateAsync(name)
      toast.success('Nome do orçamento salvo')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível renomear o orçamento.'))
    }
  }

  const create = async (event: FormEvent) => {
    event.preventDefault()
    const name = newGroupName.trim()
    if (!name) return
    try {
      await createGroup.mutateAsync(name)
      setNewGroupName('')
      toast.success(`Orçamento “${name}” criado`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível criar o orçamento.'))
    }
  }

  const activate = async (id: string, name: string) => {
    try {
      await activateGroup.mutateAsync(id)
      toast.success(`Agora você está em “${name}”`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível trocar de orçamento.'))
    }
  }

  return (
    <>
      <SectionHeader
        title="Orçamentos"
        description="Cada orçamento é uma contabilidade inteira: contas, categorias e lançamentos. Quem você convida vê e lança tudo em tempo real."
      />

      {canManage && (
        <form onSubmit={rename} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <Field className="flex-1">
            <FieldLabel htmlFor="group-name">Nome deste orçamento</FieldLabel>
            <Input
              id="group-name"
              name="group-name"
              defaultValue={activeGroup?.name ?? ''}
              key={activeGroup?.id}
              autoComplete="off"
            />
          </Field>
          <Button type="submit" variant="outline" className="sm:mt-6">
            Salvar
          </Button>
        </form>
      )}

      <section className="flex flex-col gap-3">
        <h3 className="font-medium">Quem compartilha este orçamento</h3>
        {isPending ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {members.map((member) => (
              <li key={member.id} className="flex items-center gap-3 py-2.5 pr-4 pl-4">
                <Avatar size="sm">
                  {member.image && <AvatarImage src={member.image} alt="" />}
                  <AvatarFallback className="bg-primary font-semibold text-primary-foreground">
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
                <span className="shrink-0 text-muted-foreground text-xs">
                  {roleLabels[member.role]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <section className="flex flex-col gap-3 border-t pt-6">
          <h3 className="font-medium">Convidar</h3>
          <InviteForm />
        </section>
      )}

      <section className="flex flex-col gap-3 border-t pt-6">
        <h3 className="font-medium">Seus orçamentos</h3>
        <ul className="divide-y rounded-xl border bg-card">
          {(me?.groups ?? []).map((group) => {
            const isActive = group.id === activeGroup?.id
            return (
              <li key={group.id} className="flex items-center gap-3 py-2.5 pr-2 pl-4">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{group.name}</span>
                  <span className="block text-muted-foreground text-xs">
                    {roleLabels[group.role]}
                  </span>
                </span>
                {isActive ? (
                  <span className="flex items-center gap-1 pr-2 text-muted-foreground text-xs">
                    <Check className="size-3.5 text-primary" />
                    Em uso
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={activateGroup.isPending}
                    onClick={() => activate(group.id, group.name)}
                  >
                    Usar
                  </Button>
                )}
              </li>
            )
          })}
        </ul>

        <form onSubmit={create} className="flex gap-2">
          <Input
            value={newGroupName}
            onChange={(event) => setNewGroupName(event.target.value)}
            placeholder="Nome de um novo orçamento"
            autoComplete="off"
            aria-label="Nome do novo orçamento"
          />
          <Button type="submit" variant="outline" disabled={createGroup.isPending}>
            <Plus />
            Criar
          </Button>
        </form>
      </section>
    </>
  )
}
