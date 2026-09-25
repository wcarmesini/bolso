import { type Transaction, type TransferFormValues, transferFormSchema } from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { DateField } from '@/components/date-field'
import { MoneyInput } from '@/components/money-input'
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AccountPicker } from '@/features/accounts/components/account-picker'
import { today } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { useSaveTransfer } from '../queries'

type TransferFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ausente = nova transferência; presente = editar esta (as duas pernas) */
  transfer?: Transaction | null
  /** Conta em foco na tela, que já entra como origem */
  defaultAccountId?: string | null
}

const vazio = (accountId: string | null): TransferFormValues => ({
  fromAccountId: accountId ?? '',
  toAccountId: '',
  amountCents: 0,
  date: today(),
  description: '',
})

/**
 * Passar dinheiro de uma conta para outra. Não é receita nem despesa: some dos relatórios e
 * do orçamento, e aparece só no extrato das duas contas — uma saindo, outra entrando.
 */
export function TransferFormDialog({
  open,
  onOpenChange,
  transfer,
  defaultAccountId = null,
}: TransferFormDialogProps) {
  const saveTransfer = useSaveTransfer()
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema),
    defaultValues: vazio(defaultAccountId),
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      transfer
        ? {
            // A transferência chega pela perna de saída: origem é a conta dela
            fromAccountId: transfer.accountId ?? '',
            toAccountId: transfer.transfer?.counterpartAccountId ?? '',
            amountCents: transfer.amountCents,
            date: transfer.purchaseDate,
            description: transfer.description,
          }
        : vazio(defaultAccountId),
    )
  }, [open, transfer, defaultAccountId, form])

  const submit = form.handleSubmit(async (values) => {
    try {
      await saveTransfer.mutateAsync({ groupId: transfer?.transfer?.groupId, values })
      onOpenChange(false)
      toast.success(transfer ? 'Transferência atualizada' : 'Transferência registrada')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível salvar a transferência.'))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{transfer ? 'Editar transferência' : 'Transferir'}</DialogTitle>
            <DialogDescription>
              Dinheiro mudando de conta. Não conta como gasto nem como receita.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Controller
              control={form.control}
              name="fromAccountId"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="transfer-from">De</FieldLabel>
                  <AccountPicker
                    id="transfer-from"
                    label="De"
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? '')}
                    invalid={Boolean(fieldState.error)}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <div className="-my-1 flex justify-center text-muted-foreground" aria-hidden>
              <ArrowDown className="size-4" />
            </div>

            <Controller
              control={form.control}
              name="toAccountId"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="transfer-to">Para</FieldLabel>
                  <AccountPicker
                    id="transfer-to"
                    label="Para"
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? '')}
                    invalid={Boolean(fieldState.error)}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <Controller
                control={form.control}
                name="amountCents"
                render={({ field, fieldState }) => (
                  <Field data-invalid={Boolean(fieldState.error)}>
                    <FieldLabel htmlFor="transfer-amount">Valor</FieldLabel>
                    <MoneyInput
                      id="transfer-amount"
                      autoFocus
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      aria-invalid={Boolean(fieldState.error)}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />

              <Controller
                control={form.control}
                name="date"
                render={({ field, fieldState }) => (
                  <Field data-invalid={Boolean(fieldState.error)}>
                    <FieldLabel htmlFor="transfer-date">Data</FieldLabel>
                    <DateField
                      id="transfer-date"
                      label="Data"
                      value={field.value}
                      onChange={field.onChange}
                    />
                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            </div>

            <Controller
              control={form.control}
              name="description"
              render={({ field, fieldState }) => (
                <Field data-invalid={Boolean(fieldState.error)}>
                  <FieldLabel htmlFor="transfer-description">Descrição</FieldLabel>
                  <Input
                    id="transfer-description"
                    placeholder="Ex.: Guardar para a viagem"
                    autoComplete="off"
                    {...field}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Salvando…' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
