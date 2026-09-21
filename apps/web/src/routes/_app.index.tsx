import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { InstallBanner } from '@/components/install-banner'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'

export const Route = createFileRoute('/_app/')({
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <>
      <PageHeader title="Painel" />
      <PageBody>
        <InstallBanner />
        <EmptyState
          icon={Wallet}
          title="Seu mês aparece aqui"
          text="Saldo, entradas, saídas e o andamento do orçamento por categoria."
        />
      </PageBody>
    </>
  )
}
