import type {
  ImportBatch,
  ImportDecision,
  ImportPreview,
  ImportResult,
  UndoResult,
} from '@bolso/shared'
import { api } from '@/lib/api-client'

/** Lê o extrato e diz o que é novo, o que parece com algo já lançado e o que já entrou */
export function previewOfx(input: { accountId: string; text: string }) {
  return api<ImportPreview>('/imports/ofx/preview', { method: 'POST', body: input })
}

/** Aplica as decisões. O arquivo vai junto: os valores saem dele, não do navegador */
export function confirmOfx(input: {
  accountId: string
  text: string
  label: string
  decisions: ImportDecision[]
}) {
  return api<ImportResult>('/imports/ofx/confirm', { method: 'POST', body: input })
}

/** O que já entrou, do mais recente para o mais antigo */
export function getImportHistory() {
  return api<ImportBatch[]>('/imports/history')
}

/** Anda para trás: apaga o que nasceu, solta o que foi conciliado, devolve o resto para a fila */
export function undoImport(id: string) {
  return api<UndoResult>(`/imports/history/${id}/undo`, { method: 'POST' })
}
