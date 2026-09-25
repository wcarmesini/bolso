import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { MailX, Users } from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { getInvitation } from '../api'
import { useAcceptInvitation } from '../queries'

// Tela do link de convite: /convite/<id>
export function InvitationPage({ id }: { id: string }) {
  const navigate = useNavigate()
  const accept = useAcceptInvitation()
  const {
    data: invitation,
    isPending,
    isError,
  } = useQuery({ queryKey: ['invitation', id], queryFn: () => getInvitation(id), retry: false })

  const join = async () => {
    try {
      await accept.mutateAsync(id)
      toast.success(`Você entrou em “${invitation?.groupName}”`)
      await navigate({ to: '/' })
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível aceitar o convite.'))
    }
  }

  return (
    <>
      <PageHeader title="Convite" />
      <PageBody>
        {isPending ? (
          <p className="text-muted-foreground text-sm">Carregando…</p>
        ) : isError || !invitation ? (
          <EmptyState
            icon={MailX}
            title="Convite não encontrado"
            text="O link pode ter expirado ou já ter sido usado."
          />
        ) : !invitation.available ? (
          <EmptyState
            icon={MailX}
            title="Convite indisponível"
            text="Ele já foi usado ou passou do prazo. Peça um novo para quem administra o orçamento."
          />
        ) : !invitation.forYou ? (
          <EmptyState
            icon={MailX}
            title="Convite de outra pessoa"
            text={`Este convite foi enviado para ${invitation.email}. Entre com essa conta para aceitar.`}
          />
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-xl border bg-card px-6 py-10 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <Users className="size-6" />
            </span>
            <div>
              <p className="font-semibold">
                {invitation.inviterName} convidou você para “{invitation.groupName}”
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Vocês vão ver e lançar no mesmo orçamento, em tempo real.
              </p>
            </div>
            <Button onClick={join} disabled={accept.isPending}>
              {accept.isPending ? 'Entrando…' : 'Entrar no orçamento'}
            </Button>
          </div>
        )}
      </PageBody>
    </>
  )
}
