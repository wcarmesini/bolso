import { createFileRoute } from '@tanstack/react-router'
import { BudgetPage } from '@/features/budgets/components/budget-page'

export const Route = createFileRoute('/_app/orcamento')({
  component: BudgetPage,
})
