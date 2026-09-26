import type { ImportDecision, ImportPreview } from '@bolso/shared'
import { useNavigate } from '@tanstack/react-router'
import { FileUp } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAccounts } from '@/features/accounts/queries'
import { shortDate } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { confirmOfx, previewOfx } from '../api'
import { readOfxFile } from '../read-ofx-file'
import { ReviewPanel, textosDoExtrato } from './review-panel'

/** "1 importado", "4 importados" — o singular escapa quando a frase é montada por pedaços */
const plural = (quantos: number, um: string, varios: string) =>
  `${quantos} ${quantos === 1 ? um : varios}`

/**
 * Importar um extrato OFX.
 *
 * O arquivo fica aqui no navegador entre a leitura e a confirmação, e vai junto nas duas
 * chamadas: os valores saem sempre do extrato, nunca de algo que a tela tenha guardado.
 */
export function OfxImport() {
  const navigate = useNavigate()
  const { data: accounts = [] } = useAccounts()
  const arquivoRef = useRef<HTMLInputElement>(null)

  const [accountId, setAccountId] = useState<string | null>(null)
  const [nomeDoArquivo, setNomeDoArquivo] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [lendo, setLendo] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const contaEscolhida = accounts.find((item) => item.id === accountId)
  const accountItems = accounts.map((item) => ({ value: item.id, label: item.name }))

  const escolherArquivo = async (file: File | undefined) => {
    if (!file || !accountId) return
    setLendo(true)
    try {
      const conteudo = await readOfxFile(file)
      const lido = await previewOfx({ accountId, text: conteudo })
      setText(conteudo)
      setNomeDoArquivo(file.name)
      setPreview(lido)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível ler o arquivo.'))
    } finally {
      setLendo(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  const confirmar = async (decisions: ImportDecision[]) => {
    if (!text || !accountId) return
    setSalvando(true)
    try {
      const resultado = await confirmOfx({
        accountId,
        text,
        label: nomeDoArquivo ?? 'Extrato OFX',
        decisions,
      })
      toast.success(
        [
          resultado.created > 0 && plural(resultado.created, 'importado', 'importados'),
          resultado.transferred > 0 &&
            plural(resultado.transferred, 'transferência', 'transferências'),
          resultado.linked > 0 && plural(resultado.linked, 'conciliado', 'conciliados'),
        ]
          .filter(Boolean)
          .join(' · ') || 'Nada a fazer neste extrato',
      )
      await navigate({ to: '/lancamentos' })
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível importar.'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      {/*
       * Escolher a conta e o arquivo é o começo, não a tela: depois que o extrato é lido, a
       * barra encolhe para uma linha e o espaço fica com o que importa, que é a conferência.
       */}
      <div
        className={`flex flex-wrap items-center gap-2 ${
          preview ? '' : 'rounded-xl border border-dashed bg-card/50 p-4'
        }`}
      >
        <Select
          items={accountItems}
          value={accountId ?? ''}
          onValueChange={(next) => {
            setAccountId(next as string)
            setPreview(null)
            setText(null)
          }}
        >
          <SelectTrigger
            size={preview ? 'sm' : 'default'}
            aria-label="Conta do extrato"
            className="w-48"
          >
            <SelectValue placeholder="Escolha a conta" />
          </SelectTrigger>
          <SelectContent>
            {accountItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input
          ref={arquivoRef}
          type="file"
          accept=".ofx,.OFX,text/plain"
          className="hidden"
          onChange={(event) => escolherArquivo(event.target.files?.[0])}
        />
        <Button
          variant={preview ? 'ghost' : 'outline'}
          size={preview ? 'sm' : 'default'}
          disabled={!accountId || lendo}
          onClick={() => arquivoRef.current?.click()}
          className={preview ? 'text-muted-foreground' : undefined}
        >
          <FileUp />
          {lendo ? 'Lendo…' : nomeDoArquivo ? 'Trocar arquivo' : 'Escolher arquivo OFX'}
        </Button>

        <p className="min-w-0 truncate text-muted-foreground text-xs">
          {nomeDoArquivo ?? 'Exporte o extrato em OFX no aplicativo do seu banco.'}
        </p>
      </div>

      {preview && accountId && (
        <ReviewPanel
          preview={preview}
          accountId={accountId}
          textos={textosDoExtrato}
          salvando={salvando}
          onConfirmar={confirmar}
          resumo={
            <p className="text-muted-foreground text-xs">
              {[
                contaEscolhida?.name,
                preview.accountNumber && `conta ${preview.accountNumber}`,
                preview.start &&
                  preview.end &&
                  `de ${shortDate(preview.start)} a ${shortDate(preview.end)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          }
        />
      )}
    </>
  )
}
