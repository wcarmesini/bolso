import { createFileRoute } from '@tanstack/react-router'
import { TransactionsPage } from '@/features/transactions/components/transactions-page'

export const Route = createFileRoute('/_app/lancamentos')({
  component: TransactionsPage,
})
