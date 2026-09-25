import {
  cardCycleOf,
  MAX_INSTALLMENTS,
  splitInstallments,
  statementFor,
  type TransactionFormValues,
  transactionTypeLabels,
  transactionTypesInOrder,
} from '@bolso/shared'
import { CalendarClock } from 'lucide-react'
import { memo, useState } from 'react'
import { type Control, type UseFormSetValue, useController, useWatch } from 'react-hook-form'
import { DateField } from '@/components/date-field'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { AccountPicker } from '@/features/accounts/components/account-picker'
import { useAccounts } from '@/features/accounts/queries'
import { ContactPicker } from '@/features/contacts/components/contact-picker'
import { monthLabel, shortDate } from '@/lib/dates'
import { formatCents } from '@/lib/money'

/*
 * Os campos do formulário de lançamento, um componente por campo.
 *
 * Cada um se liga só ao próprio campo (useController/useWatch), então digitar o valor não
 * repinta a categoria, a conta nem o contato — o formulário inteiro nunca re-renderiza por
 * causa de uma tecla. Quem monta o layout é transaction-form-dialog.tsx.
 */

type Campo = { control: Control<TransactionFormValues> }

/** Despesa ou receita. Trocar limpa as categorias: a API recusa categoria do outro tipo. */
export const TypeField = memo(function TypeField({
  control,
  onTypeChange,
}: Campo & { onTypeChange: () => void }) {
  const { field } = useController({ control, name: 'type' })
  return (
    <Field>
      <FieldLabel>Tipo</FieldLabel>
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[field.value]}
        onValueChange={(next) => {
          // Clicar no item já ativo desmarcaria tudo: mantém o atual
          const escolhido = next[0]
          if (escolhido !== 'expense' && escolhido !== 'income') return
          field.onChange(escolhido)
          onTypeChange()
        }}
        className="w-full"
      >
        {transactionTypesInOrder.map((value) => (
          <ToggleGroupItem key={value} value={value} className="flex-1">
            {transactionTypeLabels[value]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  )
})

export const AmountField = memo(function AmountField({ control }: Campo) {
  const { field, fieldState } = useController({ control, name: 'amountCents' })
  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor="transaction-amount">Valor</FieldLabel>
      <MoneyInput
        id="transaction-amount"
        autoFocus
        value={field.value}
        onValueChange={field.onChange}
        onBlur={field.onBlur}
        aria-invalid={Boolean(fieldState.error)}
        className="font-medium text-base"
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
})

export const DescriptionField = memo(function DescriptionField({ control }: Campo) {
  const { field, fieldState } = useController({ control, name: 'description' })
  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor="transaction-description">Descrição</FieldLabel>
      <Input
        id="transaction-description"
        placeholder="Ex.: Feira da semana"
        autoComplete="off"
        aria-invalid={Boolean(fieldState.error)}
        name={field.name}
        ref={field.ref}
        value={field.value ?? ''}
        onChange={field.onChange}
        onBlur={field.onBlur}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
})

/** Data da compra: é ela que decide em que mês o gasto conta no orçamento */
export const PurchaseDateField = memo(function PurchaseDateField({ control }: Campo) {
  const { field, fieldState } = useController({ control, name: 'purchaseDate' })
  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor="transaction-date">Data</FieldLabel>
      <DateField
        id="transaction-date"
        label="Data"
        value={field.value}
        onChange={(next) => next && field.onChange(next)}
        invalid={Boolean(fieldState.error)}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
})

/** Quando o dinheiro saiu. Vazio = ainda não pago. */
const PaymentDateField = memo(function PaymentDateField({ control }: Campo) {
  const { field, fieldState } = useController({ control, name: 'paymentDate' })
  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor="transaction-payment-date">Pago em</FieldLabel>
      <DateField
        id="transaction-payment-date"
        label="Pago em"
        value={field.value}
        onChange={field.onChange}
        clearable
        placeholder="Ainda não pago"
        invalid={Boolean(fieldState.error)}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
})

export const AccountField = memo(function AccountField({ control }: Campo) {
  const { field, fieldState } = useController({ control, name: 'accountId' })
  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor="transaction-account">Conta</FieldLabel>
      <AccountPicker
        id="transaction-account"
        value={field.value}
        onChange={field.onChange}
        invalid={Boolean(fieldState.error)}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
})

export const ContactField = memo(function ContactField({ control }: Campo) {
  const { field, fieldState } = useController({ control, name: 'contactId' })
  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor="transaction-contact">Contato</FieldLabel>
      <ContactPicker
        id="transaction-contact"
        value={field.value ?? null}
        onChange={field.onChange}
      />
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
})

/** Em quantas vezes, com o valor de cada parcela logo abaixo */
const InstallmentsField = memo(function InstallmentsField({ control }: Campo) {
  const { field, fieldState } = useController({ control, name: 'installments' })
  const amount = useWatch({ control, name: 'amountCents' }) ?? 0
  const vezes = field.value ?? 1
  const parcelas = splitInstallments(amount || 0, Math.max(1, vezes))
  const desigual = parcelas[0] !== parcelas.at(-1)

  return (
    <Field data-invalid={Boolean(fieldState.error)}>
      <FieldLabel htmlFor="transaction-installments">Parcelas</FieldLabel>
      <Input
        id="transaction-installments"
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_INSTALLMENTS}
        value={vezes}
        onChange={(event) => field.onChange(Number(event.target.value) || 1)}
        onBlur={field.onBlur}
        aria-invalid={Boolean(fieldState.error)}
      />
      {vezes > 1 && (
        <FieldDescription>
          {vezes}x de {formatCents(parcelas[0] ?? 0)}
          {desigual && ' (a 1ª leva os centavos que sobram)'}
        </FieldDescription>
      )}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
})

/**
 * A última linha muda com a conta escolhida: no cartão, "pago em" some (quem manda é o
 * vencimento da fatura) e aparece o aviso de em qual fatura a compra cai.
 */
export const CashFields = memo(function CashFields({
  control,
  editando,
  setValue,
}: Campo & { editando: boolean; setValue: UseFormSetValue<TransactionFormValues> }) {
  const { data: accounts = [] } = useAccounts()
  const accountId = useWatch({ control, name: 'accountId' })
  const purchaseDate = useWatch({ control, name: 'purchaseDate' })
  const installments = useWatch({ control, name: 'installments' }) ?? 1
  const [parcelando, setParcelando] = useState(false)

  const account = accounts.find((item) => item.id === accountId)
  const cycle = account ? cardCycleOf(account) : null
  const statement =
    cycle && /^\d{4}-\d{2}-\d{2}$/.test(purchaseDate ?? '')
      ? statementFor(purchaseDate, cycle)
      : null
  const parcelado = !editando && installments > 1

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {!cycle && <PaymentDateField control={control} />}
        {/* Parcelar é exceção: o campo só aparece para quem pedir */}
        {!editando &&
          (parcelando ? (
            <InstallmentsField control={control} />
          ) : (
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-2 text-muted-foreground"
                onClick={() => {
                  setParcelando(true)
                  setValue('installments', 2)
                }}
              >
                <CalendarClock />
                Parcelar
              </Button>
            </div>
          ))}
      </div>
      {(statement || parcelado) && (
        <FieldDescription>
          {statement
            ? `${parcelado ? 'A 1ª parcela cai' : 'Cai'} na fatura de ${monthLabel(statement.month)}, que vence em ${shortDate(statement.dueDate)}.`
            : 'Uma parcela por mês, a partir da data da compra. As próximas ficam "a pagar".'}
        </FieldDescription>
      )}
    </div>
  )
})
