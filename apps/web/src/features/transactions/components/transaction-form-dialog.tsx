import {
  type EditScope,
  isReconciled,
  type Transaction,
  type TransactionFormValues,
  transactionFormSchema,
} from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useState } from 'react'
import { type Resolver, useForm, useFormState } from 'react-hook-form'
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
import { Field, FieldDescription, FieldGroup } from '@/components/ui/field'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { today } from '@/lib/dates'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { useSaveTransaction } from '../queries'
import { ProvaDaConciliacao } from './reconciliation-note'
import { SplitsField } from './splits-field'
import {
  AccountField,
  AmountField,
  CashFields,
  ContactField,
  DescriptionField,
  PurchaseDateField,
  TypeField,
} from './transaction-form-fields'
import { TransactionHistory } from './transaction-history'

const emptyValues = (
  accountId: string | null,
  type: TransactionFormValues['type'] = 'expense',
): TransactionFormValues => ({
  type,
  amountCents: 0,
  description: '',
  accountId,
  contactId: null,
  purchaseDate: today(),
  paymentDate: today(),
  splits: [{ categoryId: null, amountCents: 0 }],
  installments: 1,
})

const scopeItems: { value: EditScope; label: string }[] = [
  { value: 'one', label: 'Só esta parcela' },
  { value: 'all', label: 'Todas as parcelas' },
]

/*
 * Com uma categoria só, ela vale o lançamento inteiro. Em vez de gravar isso a cada tecla
 * digitada (uma re-renderização por dígito), o ajuste acontece aqui, uma vez, na validação.
 */
const base = zodResolver(transactionFormSchema)
const resolver: Resolver<TransactionFormValues> = (values, context, options) =>
  base(
    values.splits?.length === 1
      ? { ...values, splits: [{ ...values.splits[0], amountCents: values.amountCents }] }
      : values,
    context,
    options,
  )

type TransactionFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ausente = novo lançamento */
  transaction?: Transaction | null
  /** Lançamento copiado: abre como novo, já preenchido (menos a parcela e o extrato) */
  cloneOf?: Transaction | null
  /** Mês que está sendo visto, para o novo lançamento já cair nele */
  month: string
  /** Conta que a lista está filtrando: o lançamento novo já vem nela */
  defaultAccountId?: string | null
  /** Quem abriu já escolheu se é entrada ou saída (o menu do botão "Novo lançamento") */
  defaultType?: TransactionFormValues['type']
  /*
   * Abre já preenchido com o que se sabe (ex.: a linha do extrato que está sendo conferida).
   * Diferente de `cloneOf`, que copia um lançamento inteiro que já existe.
   */
  initialValues?: Partial<TransactionFormValues> | null
  /** Avisa quem abriu qual lançamento nasceu, para ele seguir o fluxo dele */
  onSaved?: (transaction: Transaction) => void
}

/**
 * Formulário de lançamento.
 *
 * Este componente é só a moldura: o diálogo, a ordem dos campos e o salvar. Cada campo é um
 * componente próprio (transaction-form-fields.tsx) ligado apenas ao seu valor, para digitar
 * não custar uma re-renderização do formulário inteiro.
 */
export function TransactionFormDialog({
  open,
  onOpenChange,
  transaction,
  cloneOf,
  month,
  defaultAccountId = null,
  defaultType = 'expense',
  initialValues = null,
  onSaved,
}: TransactionFormDialogProps) {
  const saveTransaction = useSaveTransaction()
  const [scope, setScope] = useState<EditScope>('one')

  const form = useForm<TransactionFormValues>({ resolver, defaultValues: emptyValues(null) })
  const { control, reset, getValues, setValue, setError, handleSubmit } = form

  // Cada abertura começa do zero (novo) ou com os dados do lançamento (edição/cópia)
  useEffect(() => {
    if (!open) return
    setScope('one')
    const modelo = transaction ?? cloneOf
    if (modelo) {
      reset({
        type: modelo.type,
        amountCents: modelo.amountCents,
        description: modelo.description,
        accountId: modelo.accountId,
        contactId: modelo.contactId,
        // A cópia nasce hoje; a edição mantém as datas do lançamento
        purchaseDate: transaction ? modelo.purchaseDate : today(),
        paymentDate: transaction ? modelo.paymentDate : modelo.paymentDate ? today() : null,
        splits: modelo.splits.length
          ? modelo.splits
          : [{ categoryId: null, amountCents: modelo.amountCents }],
        installments: 1,
      })
      return
    }
    const values = emptyValues(defaultAccountId, defaultType)
    // Olhando outro mês, o lançamento novo nasce lá, e não na data de hoje
    if (!values.purchaseDate.startsWith(month)) {
      values.purchaseDate = `${month}-01`
      values.paymentDate = `${month}-01`
    }
    reset(initialValues ? { ...values, ...initialValues } : values)
  }, [open, transaction, cloneOf, month, defaultAccountId, defaultType, initialValues, reset])

  // As categorias escolhidas eram do outro tipo: a API recusaria
  const limparCategorias = useCallback(() => {
    setValue(
      'splits',
      getValues('splits').map((split) => ({ ...split, categoryId: null })),
    )
  }, [getValues, setValue])

  const submit = handleSubmit(async (values) => {
    try {
      const salvo = await saveTransaction.mutateAsync({ id: transaction?.id, values, scope })
      onOpenChange(false)
      /*
       * Quem abriu o formulário para um fim próprio (conferir uma linha do banco, por
       * exemplo) conta o que aconteceu com as palavras dele. Dois avisos para a mesma ação
       * é ruído.
       */
      if (onSaved) {
        onSaved(salvo)
        return
      }
      toast.success(
        transaction
          ? 'Lançamento atualizado'
          : (values.installments ?? 1) > 1
            ? `${values.installments} parcelas lançadas`
            : 'Lançamento salvo',
      )
    } catch (cause) {
      if (cause instanceof FieldValidationError) {
        setError(cause.field as keyof TransactionFormValues, { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível salvar.'))
      }
    }
  })

  const series = transaction?.installment ?? null
  const travado = isReconciled(transaction?.sources)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>
              {transaction
                ? 'Editar lançamento'
                : cloneOf
                  ? 'Copiar lançamento'
                  : 'Novo lançamento'}
            </DialogTitle>
            {series && (
              <DialogDescription>
                Parcela {series.number} de {series.count}
              </DialogDescription>
            )}
          </DialogHeader>

          <FieldGroup className="gap-4">
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
                    Descrição, conta e categorias mudam em todas. Valor e datas, só nesta.
                  </FieldDescription>
                )}
              </Field>
            )}

            <TypeField control={control} onTypeChange={limparCategorias} travado={travado} />

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <AmountField control={control} travado={travado} />
              <PurchaseDateField control={control} />
            </div>

            <DescriptionField control={control} />

            <SplitsField form={form} />

            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <AccountField control={control} travado={travado} />
              <ContactField control={control} />
            </div>

            <CashFields control={control} editando={Boolean(transaction)} setValue={setValue} />
          </FieldGroup>

          {/*
           * A conciliação é o selo de conferência: enquanto ela vale, valor, conta e tipo
           * ficam travados. Mostrar de onde ela vem (e o caminho para desfazer) é o que
           * evita a pessoa achar que o app travou sem motivo.
           */}
          {travado && transaction && (
            <ProvaDaConciliacao transaction={transaction} onDesfeita={() => onOpenChange(false)} />
          )}

          {/* Só na edição: um lançamento que acabou de nascer não tem história para contar */}
          {transaction && <TransactionHistory transactionId={transaction.id} />}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <SubmitButton control={control} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Separado para o "Salvando…" não fazer o formulário inteiro re-renderizar */
function SubmitButton({ control }: { control: TransactionFormDialogControl }) {
  const { isSubmitting } = useFormState({ control })
  return (
    <Button type="submit" disabled={isSubmitting}>
      {isSubmitting ? 'Salvando…' : 'Salvar'}
    </Button>
  )
}

type TransactionFormDialogControl = ReturnType<typeof useForm<TransactionFormValues>>['control']
