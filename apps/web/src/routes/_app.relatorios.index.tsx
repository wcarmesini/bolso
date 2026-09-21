import { createFileRoute, Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'
import { reports } from '@/lib/reports'

export const Route = createFileRoute('/_app/relatorios/')({
  component: ReportsPage,
})

function ReportsPage() {
  return (
    <>
      <PageHeader title="Relatórios" />
      <PageBody>
        <ul className="grid gap-2 md:grid-cols-2">
          {reports.map(({ slug, title, description, icon: Icon }) => (
            <li key={slug}>
              <Link
                to="/relatorios/$slug"
                params={{ slug }}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-sm">{title}</span>
                  <span className="block text-muted-foreground text-xs">{description}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      </PageBody>
    </>
  )
}
