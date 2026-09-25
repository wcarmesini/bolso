import type { GroupRole } from '@bolso/shared'
import { BookOpen, Check, MoreHorizontal, Pencil, Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useMe } from '@/features/auth/queries'
import { getInitials } from '@/lib/current-user'
import { errorMessage } from '@/lib/errors'
import { useActivateGroup, useGroupInvitations, useGroupMembers } from '../queries'
import { InviteDialog } from './invite-dialog'
import { NameDialog } from './name-dialog'

const roleLabels: Record<GroupRole, string> = {
  owner: 'Dono',
  admin: 'Administra',
  member: 'Participa',
}

const pessoas = (quantas: number) =>
  quantas <= 1 ? 'Só você' : quantas === 2 ? 'Você e mais 1' : `Você e mais ${quantas - 1}`

/**
 * Os orçamentos da pessoa.
 *
 * Cada orçamento é uma contabilidade inteira, então a tela é uma **lista deles** — e não um
 * formulário do que está em uso com listas soltas em volta. Renomear e convidar são ações do
 * orçamento, no menu dele; os outros mostram o que são e o caminho para entrar.
 *
 * As ações valem para o orçamento **em uso**: renomear e convidar mexem no que a sessão tem
 * aberto. Nos outros, o caminho é "Usar" primeiro — o que é honesto, porque é assim que o
 * servidor funciona, e evita a tela prometer algo que ela não faria.
 */
export function GroupSettings() {
  const { data: me } = useMe()
  const { data: members = [] } = useGroupMembers()
  const { data: pendentes = [] } = useGroupInvitations()
  const activateGroup = useActivateGroup()

  const [renomeando, setRenomeando] = useState(false)
  const [criando, setCriando] = useState(false)
  const [convidando, setConvidando] = useState(false)

  const emUso = me?.activeGroup
  const podeAdministrar = emUso?.role === 'owner' || emUso?.role === 'admin'

  const usar = async (id: string, name: string) => {
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
        description="Cada um é uma contabilidade própria: contas, categorias e lançamentos."
        action={
          <Button onClick={() => setCriando(true)}>
            <Plus />
            Novo orçamento
          </Button>
        }
      />

      <ul className="flex flex-col gap-2">
        {(me?.groups ?? []).map((group) => {
          const ativo = group.id === emUso?.id
          return (
            <li
              key={group.id}
              className={`rounded-xl border bg-card ${ativo ? 'border-primary/40' : ''}`}
            >
              <div className="flex items-center gap-3 py-3 pr-2 pl-4">
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    ativo ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <BookOpen className="size-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-sm">{group.name}</span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {[
                      pessoas(group.members),
                      // Convidou e a pessoa ainda não entrou: dizer "só você" esconderia isso
                      ativo && pendentes.length > 0
                        ? `${pendentes.length} ${pendentes.length === 1 ? 'convite pendente' : 'convites pendentes'}`
                        : null,
                      roleLabels[group.role],
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>

                {/* Quem está no orçamento aberto tem rosto; nos outros, o servidor não conta */}
                {ativo && members.length > 1 && (
                  <span className="-space-x-2 hidden shrink-0 items-center sm:flex">
                    {members.slice(0, 4).map((member) => (
                      <Avatar key={member.id} size="sm" className="ring-2 ring-card">
                        {member.image && <AvatarImage src={member.image} alt="" />}
                        <AvatarFallback className="bg-primary font-semibold text-primary-foreground text-xs">
                          {getInitials(member.name)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                  </span>
                )}

                {ativo ? (
                  <span className="flex shrink-0 items-center gap-1 px-2 text-primary text-xs">
                    <Check className="size-3.5" />
                    Em uso
                  </span>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0 text-muted-foreground"
                    disabled={activateGroup.isPending}
                    onClick={() => void usar(group.id, group.name)}
                  >
                    Usar
                  </Button>
                )}

                {ativo && podeAdministrar && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Ações de ${group.name}`}
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="shrink-0 text-muted-foreground"
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setConvidando(true)}>
                        <UserPlus />
                        Convidar alguém
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setRenomeando(true)}>
                        <Pencil />
                        Renomear
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="text-muted-foreground text-xs">
        Nada atravessa de um orçamento para o outro: nem lançamento, nem categoria, nem relatório.
        Convidar alguém dá acesso ao orçamento inteiro.
      </p>

      <NameDialog
        open={renomeando}
        onOpenChange={setRenomeando}
        atual={emUso?.name ?? ''}
        modo="renomear"
      />
      <NameDialog open={criando} onOpenChange={setCriando} atual="" modo="criar" />
      <InviteDialog open={convidando} onOpenChange={setConvidando} />
    </>
  )
}
