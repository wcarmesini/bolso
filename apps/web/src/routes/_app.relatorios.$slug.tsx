import { createFileRoute, notFound } from '@tanstack/react-router'
import type { ComponentType } from 'react'
import { PageBody } from '@/components/page-body'
import { PageHeader } from '@/components/page-header'
import { BudgetReport } from '@/features/reports/components/budget-report'
import { CashFlowReport } from '@/features/reports/components/cash-flow-report'
import { CategoriesReport } from '@/features/reports/components/categories-report'
import { MonthlyReport } from '@/features/reports/components/monthly-report'
import { NetWorthReport } from '@/features/reports/components/net-worth-report'
import { PeopleReport } from '@/features/reports/components/people-report'
import { findReport } from '@/lib/reports'

// Cada relatório da lista (lib/reports.ts) com a tela dele
const screens: Record<string, ComponentType> = {
  'fluxo-de-caixa': CashFlowReport,
  'mes-a-mes': MonthlyReport,
  patrimonio: NetWorthReport,
  categorias: CategoriesReport,
  'orcado-realizado': BudgetReport,
  'por-pessoa': PeopleReport,
}

export const Route = createFileRoute('/_app/relatorios/$slug')({
  loader: ({ params }) => {
    const report = findReport(params.slug)
    if (!report || !screens[report.slug]) throw notFound()
    return report
  },
  component: ReportPage,
})

function ReportPage() {
  const { slug, title } = Route.useLoaderData()
  const Screen = screens[slug]
  return (
    <>
      <PageHeader title={title} />
      <PageBody>{Screen && <Screen />}</PageBody>
    </>
  )
}
