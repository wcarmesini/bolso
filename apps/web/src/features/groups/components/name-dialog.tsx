import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { useCreateGroup, useRenameGroup } from '../queries'

type NameDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** O nome de hoje, ao renomear */
  atual: string
  modo: 'criar' | 'renomear'
}

/** Um campo só, no lugar certo: o nome de um orçamento, ao criar ou ao renomear */
export function NameDialog({ open, onOpenChange, atual, modo }: NameDialogProps) {
  const renomear = useRenameGroup()
  const criar = useCreateGroup()
  const [nome, setNome] = useState(atual)

  useEffect(() => {
    if (open) setNome(atual)
  }, [open, atual])

  const salvando = renomear.isPending || criar.isPending
  const limpo = nome.trim()

  const salvar = async () => {
    if (!limpo) return
    try {
      if (modo === 'renomear') {
        await renomear.mutateAsync(limpo)
        toast.success('Nome do orçamento salvo')
      } else {
        await criar.mutateAsync(limpo)
        toast.success(`Orçamento “${limpo}” criado — e já está em uso`)
      }
      onOpenChange(false)
    } catch (cause) {
      toast.error(
        errorMessage(
          cause,
          modo === 'renomear'
            ? 'Não foi possível renomear o orçamento.'
            : 'Não foi possível criar o orçamento.',
        ),
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            void salvar()
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {modo === 'renomear' ? 'Renomear orçamento' : 'Novo orçamento'}
            </DialogTitle>
            {modo === 'criar' && (
              <DialogDescription>
                Começa do zero, com as categorias padrão. Nada vem do orçamento atual.
              </DialogDescription>
            )}
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="orcamento-nome">Nome</FieldLabel>
            <Input
              id="orcamento-nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              placeholder="Ex.: Casa, Empresa, Viagem"
              autoComplete="off"
              autoFocus
            />
            {modo === 'criar' && (
              <FieldDescription>Você pode trocar de orçamento quando quiser.</FieldDescription>
            )}
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={salvando || !limpo}>
              {salvando ? 'Salvando…' : modo === 'renomear' ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
