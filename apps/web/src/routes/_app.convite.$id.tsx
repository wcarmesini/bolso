import { createFileRoute } from '@tanstack/react-router'
import { InvitationPage } from '@/features/groups/components/invitation-page'

// Fica dentro do app (exige login): quem não estiver logado passa pelo /entrar e volta para cá
export const Route = createFileRoute('/_app/convite/$id')({
  component: InvitationRoute,
})

function InvitationRoute() {
  const { id } = Route.useParams()
  return <InvitationPage id={id} />
}
