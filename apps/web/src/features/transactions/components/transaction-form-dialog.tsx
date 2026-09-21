import {
  cardCycleOf,
  type EditScope,
  isTransactionType,
  MAX_INSTALLMENTS,
  splitInstallments,
  statementFor,
  type Transaction,
  type TransactionFormValues,
  transactionFormSchema,
  transactionTypeLabels,
  transactionTypes,
} from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useAccounts } from '@/features/accounts/queries'
import { useCategories } from '@/features/categories/queries'
import { monthLabel, shortDate, today } from '@/lib/dates'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { formatCents } from '@/lib/money'
import { categoryOptions } from '../category-options'
import { useSaveTransaction } from '../queries'
import { SplitsField } from './splits-field'

const NONE = 'none'

const emptyValues = (accountId: string | null): TransactionFormValues => ({
  type: 'expense',
  amountCents: 0,
  description: '',
  accountId,
  purchaseDate: today(),
  paymentDate: today(),
  splits: [{ categoryId: null, amountCents: 0 }],
  installments: 1,
})

const scopeItems: { value: EditScope; label: string }[] = [
  { value: 'one', label: 'Só esta parcela' },
  { value: 'all', label: 'Todas as parcelas' },
]

type TransactionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ausente = novo lançamento */
  transaction?: Transaction | null
  /** Mês que está sendo visto, para o novo lançamento já cair nele */
  month: string
  /** Conta que a lista está filtrando: o lançamento novo já vem nela */
  defaultAccountId?: string | null
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  month,
  defaultAccountId = null,
}: TransactionFormDialogProps) {
  const saveTransaction = useSaveTransaction()
  const { data: categories = [] } = useCategories()
  const { data: accounts = [] } = useAccounts()
  const [scope, setScope] = useState<EditScope>('one')

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: emptyValues(null),
  })

  // Cada abertura começa do zero (novo) ou com os dados do lançamento (edição)
  useEffect(() => {
    if (!open) return
    setScope('one')
    if (transaction) {
      form.reset({
        type: transaction.type,
        amountCents: transaction.amountCents,
        description: transaction.description,
        accountId: transaction.accountId,
        purchaseDate: transaction.purchaseDate,
        paymentDate: transaction.paymentDate,
        splits: transaction.splits.length
          ? transaction.splits
          : [{ categoryId: null, amountCents: transaction.amountCents }],
        installments: 1,
      })
      return
    }
    const values = emptyValues(defaultAccountId)
    // Olhando outro mês, o lançamento novo nasce lá, e não na data de hoje
    if (!values.purchaseDate.startsWith(month)) {
      values.purchaseDate = `${month}-01`
      values.paymentDate = `${month}-01`
    }
    form.reset(values)
  }, [open, transaction, month, defaultAccountId, form])

  const [type, accountId, purchaseDate, amount, installments = 1] = form.watch([
    'type',
    'accountId',
    'purchaseDate',
    'amountCents',
    'installments',
  ])
  const options = useMemo(() => categoryOptions(categories, type), [categories, type])
  const accountItems = accounts.map((account) => ({ value: account.id, label: account.name }))
  const account = accounts.find((item) => item.id === accountId)
  const cycle = account ? cardCycleOf(account) : null
  const statement =
    cycle && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ? statementFor(purchaseDate, cycle) : null
  const series = transaction?.installment ?? null

  const submit = form.handleSubmit(async (values) => {
    try {
      await saveTransaction.mutateAsync({ id: transaction?.id, values, scope })
      onOpenChange(false)
      toast.success(
        transaction
          ? 'Lançamento atualizado'
          : (values.installments ?? 1) > 1
            ? `${values.installments} parcelas lançadas`
            : 'Lançamento salvo',
      )
    } catch (cause) {
      if (cause instanceof FieldValidationError) {
        form.setError(cause.field as keyof TransactionFormValues, { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível salvar.'))
      }
    }
  })

  const perInstallment = splitInstallments(amount || 0, Math.max(1, installments))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{transaction ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
            {series && (
              <DialogDescription>
                Parcela {series.number} de {series.count}
              </DialogDescription>
            )}
          </DialogHeader>

          <FieldGroup>
            {series && (
              <Field>
                <ToggleGroup
                  variant="outline"
                  spacing={0}
                  value={[scope]}
                  onValueChange={(next) => {
                    if (next[0] === 'one' || next[0] === 'all') setScope(next[0])
                  }}
                  className="w-full"
                >
                  {scopeItems.map((item) => (
                    <ToggleGroupItem key={item.value} value={item.value} className="flex-1">
                      {item.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {scope === 'all' && (
                  <FieldDescription>
                    Descrição, conta e categorias mudam em todas as parcelas. Valor e datas mudam só
                    nesta.
                  </FieldDescription>
                )}
              </Field>
            )}

            <Field>
              <FieldLabel>Tipo</FieldLabel>
              <Controller
                control={form.control}
                name="type"
                render={({ field }) => (
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    value={[field.value]}
                    onValueChange={(next) => {
                      // Clicar no item já ativo desmarcaria tudo: mantém o atual
                      if (!isTransactionType(next[0])) return
                      field.onChange(next[0])
                      // As categorias escolhidas eram do outro tipo: a API recusaria
                      form.setValue(
                        'splits',
                        form.getValues('splits').map((split) => ({ ...split, categoryId: null })),
                      )
                    }}
                    className="w-full"
                  >
                    {transactionTypes.map((value) => (
                      <ToggleGroupItem key={value} value={value} className="flex-1">
                        {transactionTypeLabels[value]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.amountCents)}>
              <FieldLabel htmlFor="transaction-amount">
                {installments > 1 ? 'Valor total' : 'Valor'}
              </FieldLabel>
              <Controller
                control={form.control}
                name="amountCents"
                render={({ field }) => (
                  <MoneyInput
                    id="transaction-amount"
                    autoFocus
                    value={field.value}
                    onValueChange={(cents) => {
                      field.onChange(cents)
                      // Com uma categoria só, ela acompanha o valor inteiro
                      if (form.getValues('splits').length === 1) {
                        form.setValue('splits.0.amountCents', cents)
                      }
                    }}
                    aria-invalid={Boolean(form.formState.errors.amountCents)}
                    className="text-lg"
                  />
                )}
              />
              <FieldError errors={[form.formState.errors.amountCents]} />
            </Field>

            <Field data-invalid={Boolean(form.formState.errors.description)}>
              <FieldLabel htmlFor="transaction-description">Descrição</FieldLabel>
              <Input
                id="transaction-description"
                placeholder="Ex.: Feira da semana"
                autoComplete="off"
                aria-invalid={Boolean(form.formState.errors.description)}
                {...form.register('description')}
              />
              <FieldError errors={[form.formState.errors.description]} />
            </Field>

            <SplitsField form={form} options={options} />

            <Field data-invalid={Boolean(form.formState.errors.accountId)}>
              <FieldLabel htmlFor="transaction-account">Conta</FieldLabel>
              <Controller
                control={form.control}
                name="accountId"
                render={({ field }) => (
                  <Select
                    items={[{ value: NONE, label: 'Sem conta' }, ...accountItems]}
                    value={field.value ?? NONE}
                    onValueChange={(next) => field.onChange(next === NONE ? null : next)}
                  >
                    <SelectTrigger id="transaction-account" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem conta</SelectItem>
                      {accountItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[form.formState.errors.accountId]} />
            </Field>

            {!transaction && (
              <Field data-invalid={Boolean(form.formState.errors.installments)}>
                <FieldLabel htmlFor="transaction-installments">Parcelas</FieldLabel>
                <Controller
                  control={form.control}
                  name="installments"
                  render={({ field }) => (
                    <Input
                      id="transaction-installments"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_INSTALLMENTS}
                      value={field.value ?? 1}
                      onChange={(event) => field.onChange(Number(event.target.value) || 1)}
                      aria-invalid={Boolean(form.formState.errors.installments)}
                      className="w-24"
                    />
                  )}
                />
                <FieldDescription>
                  {installments > 1
                    ? `${installments}x de ${formatCents(perInstallment[0] ?? 0)}, uma por mês${
                        perInstallment[0] !== perInstallment.at(-1)
                          ? ' (os centavos que sobram vão na 1ª)'
                          : ''
                      }.`
                    : 'À vista. Para parcelar, informe em quantas vezes.'}
                </FieldDescription>
                <FieldError errors={[form.formState.errors.installments]} />
              </Field>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={Boolean(form.formState.errors.purchaseDate)}>
                <FieldLabel htmlFor="transaction-date">Data da compra</FieldLabel>
                <Input
                  id="transaction-date"
                  type="date"
                  aria-invalid={Boolean(form.formState.errors.purchaseDate)}
                  {...form.register('purchaseDate')}
                />
                <FieldError errors={[form.formState.errors.purchaseDate]} />
              </Field>

              {!cycle && (
                <Field data-invalid={Boolean(form.formState.errors.paymentDate)}>
                  <FieldLabel htmlFor="transaction-payment-date">Pago em</FieldLabel>
                  <Controller
                    control={form.control}
                    name="paymentDate"
                    render={({ field }) => (
                      <Input
                        id="transaction-payment-date"
                        type="date"
                        value={field.value ?? ''}
                        onChange={(event) => field.onChange(event.target.value || null)}
                        aria-invalid={Boolean(form.formState.errors.paymentDate)}
                      />
                    )}
                  />
                  <FieldError errors={[form.formState.errors.paymentDate]} />
                </Field>
              )}
            </div>
            <FieldDescription>
              {statement
                ? `${installments > 1 && !transaction ? 'A 1ª parcela cai' : 'Cai'} na fatura de ${monthLabel(
                    statement.month,
                  )}, que vence em ${shortDate(statement.dueDate)}. O orçamento conta pela data da compra.`
                : installments > 1 && !transaction
                  ? 'A data da compra decide o mês do orçamento de cada parcela. As próximas parcelas ficam "a pagar".'
                  : 'A data da compra decide o mês do orçamento. Deixe "Pago em" vazio enquanto não tiver saído da conta.'}
            </FieldDescription>
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
