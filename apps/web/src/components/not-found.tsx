import { Link } from '@tanstack/react-router'
import { SearchX } from 'lucide-react'
import { EmptyState } from './empty-state'
import { PageBody } from './page-body'

export function NotFound() {
  return (
    <PageBody>
      <EmptyState
        icon={SearchX}
        title="Página não encontrada"
        text="O endereço não existe ou mudou."
      />
      <Link to="/" className="self-center text-muted-foreground text-sm hover:text-foreground">
        Voltar ao painel
      </Link>
    </PageBody>
  )
}
