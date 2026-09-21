import {
  type Account,
  type AccountFormValues,
  accountFormSchema,
  accountTypes,
  hasInitialBalance,
  isAccountType,
} from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { accountTypeMeta } from '../meta'
import { useSaveAccount } from '../queries'

const typeItems = accountTypes.map((type) => ({ value: type, label: accountTypeMeta[type].label }))

const emptyValues: AccountFormValues = {
  name: '',
  type: 'checking',
  initialBalanceCents: 0,
  closingDay: null,
  dueDay: null,
  limitCents: null,
}

type DayField = 'closingDay' | 'dueDay'

type AccountFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ausente = nova conta */
  account?: Account | null
}

export function AccountFormDialog({ open, onOpenChange, account }: AccountFormDialogProps) {
  const saveAccount = useSaveAccount()

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    form.reset(
      account
        ? {
            name: account.name,
            type: account.type,
            initialBalanceCents: account.initialBalanceCents,
            closingDay: account.closingDay,
            dueDay: account.dueDay,
            limitCents: account.limitCents,
          }
        : emptyValues,
    )
  }, [open, account, form])

  const type = form.watch('type')

  const submit = form.handleSubmit(async (values) => {
    try {
      await saveAccount.mutateAsync({ id: account?.id, values })
      onOpenChange(false)
      toast.success(account ? 'Conta atualizada' : 'Conta criada')
    } catch (cause) {
      if (cause instanceof FieldValidationError) {
        form.setError(cause.field as keyof AccountFormValues, { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível salvar.'))
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{account ? 'Editar conta' : 'Nova conta'}</DialogTitle>
            <DialogDescription>
              Onde o dinheiro entra e sai: banco, cartão ou carteira.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor="account-name">Nome</FieldLabel>
              <Input
                id="account-name"
                placeholder="Ex.: Nubank, Itaú, Carteira"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="account-type">Tipo</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <Select
                    items={typeItems}
                    value={field.value}
                    onValueChange={(next) => {
                      if (isAccountType(next)) field.onChange(next)
                    }}
                  >
                    <SelectTrigger id="account-type" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {typeItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            {hasInitialBalance(type) ? (
              <Field>
                <FieldLabel htmlFor="account-balance">Saldo inicial</FieldLabel>
                <Controller
                  control={form.control}
                  name="initialBalanceCents"
                  render={({ field }) => (
                    <MoneyInput
                      id="account-balance"
                      value={field.value}
                      onValueChange={field.onChange}
                    />
                  )}
                />
                <FieldDescription>
                  Quanto havia na conta quando você começou a usar o Bolso.
                </FieldDescription>
              </Field>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {(
                    [
                      ['closingDay', 'Fecha no dia', 'Ex.: 25'],
                      ['dueDay', 'Vence no dia', 'Ex.: 5'],
                    ] as [DayField, string, string][]
                  ).map(([name, label, placeholder]) => (
                    <Field key={name} data-invalid={Boolean(form.formState.errors[name])}>
                      <FieldLabel htmlFor={`account-${name}`}>{label}</FieldLabel>
                      <Controller
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <Input
                            id={`account-${name}`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={31}
                            placeholder={placeholder}
                            value={field.value ?? ''}
                            onChange={(event) =>
                              field.onChange(
                                event.target.value === '' ? null : Number(event.target.value),
                              )
                            }
                            aria-invalid={Boolean(form.formState.errors[name])}
                          />
                        )}
                      />
                      <FieldError errors={[form.formState.errors[name]]} />
                    </Field>
                  ))}
                </div>
                <FieldDescription className="-mt-2">
                  Compras feitas no dia do fechamento ou depois já entram na fatura seguinte.
                </FieldDescription>
                <Field>
                  <FieldLabel htmlFor="account-limit">Limite</FieldLabel>
                  <Controller
                    control={form.control}
                    name="limitCents"
                    render={({ field }) => (
                      <MoneyInput
                        id="account-limit"
                        value={field.value ?? 0}
                        onValueChange={(cents) => field.onChange(cents === 0 ? null : cents)}
                      />
                    )}
                  />
                </Field>
              </>
            )}
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
