import { MAX_SPLITS, type TransactionFormValues } from '@bolso/shared'
import { Plus, Split, X } from 'lucide-react'
import { useMemo } from 'react'
import { Controller, type UseFormReturn, useFieldArray, useWatch } from 'react-hook-form'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { useCategories } from '@/features/categories/queries'
import { formatCents } from '@/lib/money'
import { categoryTree } from '../category-options'
import { CategoryPicker } from './category-picker'

type SplitsFieldProps = {
  form: UseFormReturn<TransactionFormValues>
}

/**
 * Categoria do lançamento. Normalmente é uma só; "Dividir em categorias" abre uma linha
 * por categoria com o valor de cada uma (ex.: R$ 300 no mercado = 250 de Mercado + 50 de Casa).
 * A soma precisa bater com o total, e o campo mostra quanto falta distribuir.
 */
export function SplitsField({ form }: SplitsFieldProps) {
  const { data: categories = [] } = useCategories()
  // O tipo vem daqui, e não do diálogo: assim trocar despesa/receita não repinta o resto
  const type = useWatch({ control: form.control, name: 'type' })
  const tree = useMemo(() => categoryTree(categories, type), [categories, type])
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'splits' })
  // Só as categorias escolhidas; o valor total é observado à parte, para digitar não
  // re-renderizar a lista inteira de seletores
  const splits = useWatch({ control: form.control, name: 'splits' }) ?? []
  const split = fields.length > 1

  const errors = form.formState.errors.splits
  const rootError = errors?.message ?? errors?.root?.message

  const categorySelect = (index: number) => {
    // Cada categoria entra uma vez só: as já usadas nas outras linhas não aparecem
    const usedElsewhere = new Set(
      splits.flatMap((item, other) =>
        other !== index && item.categoryId ? [item.categoryId] : [],
      ),
    )
    return (
      <Controller
        control={form.control}
        name={`splits.${index}.categoryId`}
        render={({ field }) => (
          <CategoryPicker
            tree={tree}
            kind={type}
            value={field.value}
            onChange={field.onChange}
            exclude={usedElsewhere}
            id={index === 0 ? 'transaction-category' : undefined}
            label={split ? `Categoria ${index + 1}` : 'Categoria'}
            invalid={Boolean(rootError)}
          />
        )}
      />
    )
  }

  if (!split) {
    return (
      <Field data-invalid={Boolean(rootError)}>
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor="transaction-category">Categoria</FieldLabel>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className="-my-1 text-muted-foreground"
            onClick={() => {
              form.setValue('splits.0.amountCents', form.getValues('amountCents'))
              append({ categoryId: null, amountCents: 0 })
            }}
          >
            <Split />
            Dividir em categorias
          </Button>
        </div>
        {categorySelect(0)}
        <FieldError errors={[{ message: rootError }]} />
      </Field>
    )
  }

  return (
    <Field data-invalid={Boolean(rootError)}>
      <FieldLabel>Categorias</FieldLabel>
      <div className="flex flex-col gap-2">
        {fields.map((item, index) => (
          <div key={item.id} className="flex items-center gap-2">
            <div className="min-w-0 flex-1">{categorySelect(index)}</div>
            <Controller
              control={form.control}
              name={`splits.${index}.amountCents`}
              render={({ field, fieldState }) => (
                <MoneyInput
                  aria-label={`Valor da categoria ${index + 1}`}
                  value={field.value}
                  onValueChange={field.onChange}
                  aria-invalid={Boolean(fieldState.error)}
                  className="w-32 shrink-0"
                />
              )}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Tirar a categoria ${index + 1}`}
              className="shrink-0 text-muted-foreground"
              onClick={() => {
                remove(index)
                // Voltou a ser uma categoria só: ela fica com o valor inteiro
                if (fields.length === 2) {
                  form.setValue('splits.0.amountCents', form.getValues('amountCents'))
                }
              }}
            >
              <X />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className="-ml-2 text-muted-foreground"
          disabled={fields.length >= MAX_SPLITS}
          // A linha nova já vem com o que falta distribuir
          onClick={() => {
            const total = form.getValues('amountCents')
            const distribuido = form
              .getValues('splits')
              .reduce((soma, item) => soma + (item.amountCents || 0), 0)
            append({ categoryId: null, amountCents: Math.max(total - distribuido, 0) })
          }}
        >
          <Plus />
          Adicionar categoria
        </Button>
        <RestanteADistribuir form={form} />
      </div>
      <FieldError errors={[{ message: rootError }]} />
    </Field>
  )
}

/** Quanto falta distribuir. Fica separado porque é a única parte que acompanha cada tecla. */
function RestanteADistribuir({ form }: { form: UseFormReturn<TransactionFormValues> }) {
  const amount = useWatch({ control: form.control, name: 'amountCents' }) ?? 0
  const splits = useWatch({ control: form.control, name: 'splits' }) ?? []
  const missing = amount - splits.reduce((total, item) => total + (item.amountCents || 0), 0)

  return (
    <span
      className={
        missing === 0
          ? 'text-muted-foreground'
          : missing > 0
            ? 'text-foreground'
            : 'text-destructive'
      }
    >
      {missing === 0
        ? 'Tudo distribuído'
        : missing > 0
          ? `Falta distribuir ${formatCents(missing)}`
          : `Passou ${formatCents(-missing)} do total`}
    </span>
  )
}
