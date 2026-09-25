import { type AccessLevel, accessLevels, inviteInputSchema, roleLabels } from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Check, ChevronDown, Copy, UserPlus, X } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useMe } from '@/features/auth/queries'
import { getInitials } from '@/lib/current-user'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import {
  useCancelInvitation,
  useGroupInvitations,
  useGroupMembers,
  useInviteToGroup,
  useRemoveMember,
  useSetMemberRole,
} from '../queries'

const niveis = accessLevels.map((nivel) => ({ value: nivel, label: roleLabels[nivel] }))

/**
 * O que dá para fazer com o acesso de alguém, num controle só.
 *
 * Trocar o nível e tirar o acesso são a mesma decisão vista de dois jeitos, então moram no
 * mesmo menu — e a linha fica com uma coisa à direita, não três.
 */
function AcessoDe({
  nome,
  nivel,
  ocupado,
  onNivel,
  onTirar,
}: {
  nome: string
  nivel: AccessLevel
  ocupado: boolean
  onNivel: (nivel: AccessLevel) => void
  onTirar: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Acesso de ${nome}`}
        disabled={ocupado}
        render={
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground font-normal"
          />
        }
      >
        {roleLabels[nivel]}
        <ChevronDown className="opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {accessLevels.map((opcao) => (
          <DropdownMenuItem key={opcao} onClick={() => onNivel(opcao)}>
            <Check className={opcao === nivel ? '' : 'opacity-0'} />
            {roleLabels[opcao]}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onTirar}>
          <X />
          Remover Acesso
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** O seletor de nível do campo de convite */
function NivelSelect({
  value,
  onValueChange,
  disabled,
  label,
}: {
  value: AccessLevel
  onValueChange: (nivel: AccessLevel) => void
  disabled?: boolean
  label: string
}) {
  return (
    <Select
      items={niveis}
      value={value}
      disabled={disabled}
      onValueChange={(next) => onValueChange(next as AccessLevel)}
    >
      {/* Mesma altura do campo de e-mail e do botão ao lado: os três formam uma linha só */}
      <SelectTrigger aria-label={label} className="w-36 shrink-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {accessLevels.map((nivel) => (
          <SelectItem key={nivel} value={nivel}>
            {roleLabels[nivel]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Quem tem acesso a este orçamento, com que nível, e como dar acesso a mais alguém.
 *
 * As três coisas moram juntas porque são a mesma pergunta — "quem entra aqui?" —, e convidar
 * só faz sentido ao lado da resposta. O nível é escolhido no convite e pode mudar depois;
 * tirar o acesso é imediato, e quem sai fica sem ver nada deste orçamento no mesmo instante.
 *
 * O dono não aparece com seletor: é quem criou o orçamento, e rebaixá-lo deixaria o livro sem
 * responsável. O servidor recusa isso mesmo que a tela ofereça.
 */
export function ShareDialog({
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
  const mudarNivel = useSetMemberRole()
  const tirarAcesso = useRemoveMember()
  const cancelarConvite = useCancelInvitation()
  const [copiado, setCopiado] = useState<string | null>(null)
  const [nivelNovo, setNivelNovo] = useState<AccessLevel>('member')

  const form = useForm<{ email: string }>({
    resolver: zodResolver(inviteInputSchema.pick({ email: true })),
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
      const criado = await convidar.mutateAsync({ email: values.email, role: nivelNovo })
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

  const trocar = async (id: string, nome: string, role: AccessLevel) => {
    try {
      await mudarNivel.mutateAsync({ id, role })
      toast.success(`${nome} agora ${role === 'viewer' ? 'só pode ver' : 'pode editar'}`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível mudar o nível.'))
    }
  }

  const tirar = async (id: string, nome: string) => {
    try {
      await tirarAcesso.mutateAsync(id)
      toast.success(`${nome} não tem mais acesso a este orçamento`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível tirar o acesso.'))
    }
  }

  const cancelar = async (id: string, email: string) => {
    try {
      await cancelarConvite.mutateAsync(id)
      toast.success(`Convite para ${email} cancelado`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível cancelar o convite.'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <div className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>Compartilhar “{me?.activeGroup?.name}”</DialogTitle>
            <DialogDescription>
              Quem entra vê o orçamento inteiro, em tempo real. O nível decide se também mexe nele.
            </DialogDescription>
          </DialogHeader>

          <ul className="-mx-1 flex flex-col">
            {members.map((member) => {
              const euMesmo = member.userId === me?.user.id
              const dono = member.role === 'owner'
              return (
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
                      {euMesmo && <span className="text-muted-foreground"> · você</span>}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {member.email}
                    </span>
                  </span>

                  {/* No dono e em você mesmo, o nível é só informação: não há o que trocar */}
                  {dono || euMesmo ? (
                    /*
                     * Aqui o nível é só informação — mas ocupa a mesma caixa do menu ao lado,
                     * com a seta invisível no lugar dela, para os rótulos caírem na mesma
                     * coluna. Sem isso, "Dono" avança sobre a margem e a lista torta salta aos
                     * olhos.
                     */
                    <Button
                      render={<span />}
                      nativeButton={false}
                      variant="ghost"
                      size="sm"
                      className="pointer-events-none shrink-0 font-normal text-muted-foreground"
                    >
                      {roleLabels[member.role]}
                      <ChevronDown className="invisible opacity-70" aria-hidden />
                    </Button>
                  ) : (
                    <AcessoDe
                      nome={member.name}
                      nivel={member.role === 'viewer' ? 'viewer' : 'member'}
                      ocupado={mudarNivel.isPending || tirarAcesso.isPending}
                      onNivel={(nivel) => void trocar(member.id, member.name, nivel)}
                      onTirar={() => void tirar(member.id, member.name)}
                    />
                  )}
                </li>
              )
            })}

            {pendentes.map((convite) => (
              <li key={convite.id} className="flex items-center gap-2.5 px-1 py-1.5">
                {/* Do tamanho de um avatar: as três linhas começam na mesma coluna */}
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <UserPlus className="size-3" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{convite.email}</span>
                  <span className="block text-muted-foreground text-xs">Convite pendente</span>
                </span>
                {/* Mesma forma da linha de cima: o nível à direita, e as ações dentro dele */}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Convite de ${convite.email}`}
                    disabled={cancelarConvite.isPending}
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="shrink-0 font-normal text-muted-foreground"
                      />
                    }
                  >
                    {copiado === convite.id ? <Check /> : null}
                    {copiado === convite.id ? 'Copiado' : roleLabels[convite.role]}
                    <ChevronDown className="opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => void copiar(convite.id, convite.link)}>
                      <Copy />
                      Copiar link
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void cancelar(convite.id, convite.email)}
                    >
                      <X />
                      Cancelar convite
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
            <NivelSelect
              value={nivelNovo}
              label="Nível de quem for convidado"
              onValueChange={setNivelNovo}
            />
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
