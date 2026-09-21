import { ArrowLeftRight, ChartColumn, House, PiggyBank } from 'lucide-react'

// Ordem segue o método do app: planejar (Orçamento) antes de gastar (Lançamentos).
// Ajustes não entra aqui: fica na engrenagem da barra superior
export const navItems = [
  { to: '/', label: 'Painel', icon: House },
  { to: '/orcamento', label: 'Orçamento', icon: PiggyBank },
  { to: '/lancamentos', label: 'Lançamentos', icon: ArrowLeftRight },
] as const

// No desktop vira menu suspenso; no celular, uma aba que abre a lista de relatórios
export const reportsNavItem = { to: '/relatorios', label: 'Relatórios', icon: ChartColumn } as const
