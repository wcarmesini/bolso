import { createFileRoute } from '@tanstack/react-router'
import { ImportPage } from '@/features/imports/components/import-page'

export const Route = createFileRoute('/_app/importar')({
  component: ImportPage,
})
