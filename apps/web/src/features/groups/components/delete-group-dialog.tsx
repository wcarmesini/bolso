import { TriangleAlert } from 'lucide-react'
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
import { useDeleteGroup, useGroupContents } from '../queries'

type DeleteGroupDialogProps = {
  /** O orçamento a excluir; `null` fecha */
  group: { id: string; name: string } | null
  onOpenChange: (open: boolean) => void
}

const conta = (quantos: number, um: string, muitos: string) =>
  `${quantos} ${quantos === 1 ? um : muitos}`

/**
 * Excluir um orçamento.
 *
 * É o único lugar do Bolso onde algo sai do banco de verdade: não há lixeira, não há desfazer.
 * Então a tela faz duas coisas antes de deixar: diz o tamanho da perda em números — contas,
 * categorias, lançamentos, gente — e pede o nome escrito à mão. Digitar "excluir" confirma que
 * a pessoa leu; digitar o nome confirma que ela está no orçamento que queria.
 */
export function DeleteGroupDialog({ group, onOpenChange }: DeleteGroupDialogProps) {
  const { data: conteudo, isPending } = useGroupContents(group?.id ?? null)
  const excluir = useDeleteGroup()
  const [escrito, setEscrito] = useState('')

  useEffect(() => {
    if (group) setEscrito('')
  }, [group])

  const confere = escrito.trim().toLocaleLowerCase() === (group?.name ?? '').toLocaleLowerCase()

  const confirmar = async () => {
    if (!group || !confere) return
    try {
      await excluir.mutateAsync(group.id)
      onOpenChange(false)
      toast.success(`“${group.name}” foi excluído`)
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível excluir o orçamento.'))
    }
  }

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            void confirmar()
          }}
        >
          <DialogHeader>
            <DialogTitle>Excluir “{group?.name}”?</DialogTitle>
            <DialogDescription>
              Isto não tem volta e não vai para a lixeira. O orçamento some para todo mundo que
              participa dele.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p>Vai embora junto:</p>
              {isPending || !conteudo ? (
                <p className="text-muted-foreground">Conferindo o que tem dentro…</p>
              ) : (
                <p className="text-muted-foreground">
                  {[
                    conta(conteudo.transactions, 'lançamento', 'lançamentos'),
                    conta(conteudo.accounts, 'conta', 'contas'),
                    conta(conteudo.categories, 'categoria', 'categorias'),
                  ].join(', ')}
                  {conteudo.people > 1 && `, e o acesso de ${conteudo.people} pessoas`}. Os
                  relatórios, as importações e o histórico também.
                </p>
              )}
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="excluir-confirmacao">
              Escreva “{group?.name}” para confirmar
            </FieldLabel>
            <Input
              id="excluir-confirmacao"
              value={escrito}
              onChange={(event) => setEscrito(event.target.value)}
              autoComplete="off"
              autoFocus
            />
            <FieldDescription>O nome, para não excluir o orçamento errado.</FieldDescription>
          </Field>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" variant="destructive" disabled={!confere || excluir.isPending}>
              {excluir.isPending ? 'Excluindo…' : 'Excluir orçamento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
