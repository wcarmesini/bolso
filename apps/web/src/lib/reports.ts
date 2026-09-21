import { ChartPie, type LucideIcon, Target, TrendingUp, Users } from 'lucide-react'

export type Report = {
  slug: string
  title: string
  description: string
  icon: LucideIcon
}

export const reports: Report[] = [
  {
    slug: 'fluxo-de-caixa',
    title: 'Fluxo de caixa',
    description: 'Entradas e saídas mês a mês.',
    icon: TrendingUp,
  },
  {
    slug: 'categorias',
    title: 'Gastos por categoria',
    description: 'Para onde o dinheiro está indo.',
    icon: ChartPie,
  },
  {
    slug: 'orcado-realizado',
    title: 'Orçado × realizado',
    description: 'Quanto de cada orçamento já foi usado.',
    icon: Target,
  },
  {
    slug: 'por-pessoa',
    title: 'Gastos por pessoa',
    description: 'Quem lançou o quê no grupo.',
    icon: Users,
  },
]

export function findReport(slug: string) {
  return reports.find((report) => report.slug === slug)
}
