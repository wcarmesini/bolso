import { createFileRoute } from '@tanstack/react-router'
import { InstallCard } from '@/components/install-card'
import { SectionHeader } from '@/components/section-header'

export const Route = createFileRoute('/_app/ajustes/aplicativo')({
  component: AppSettings,
})

function AppSettings() {
  return (
    <>
      <SectionHeader
        title="Aplicativo"
        description="Instale o Bolso para abrir direto da tela inicial, em tela cheia."
      />
      <div className="rounded-xl border bg-card p-4 md:p-6">
        <InstallCard />
      </div>
    </>
  )
}
