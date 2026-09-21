import { MAX_SPLITS, type TransactionFormValues } from '@bolso/shared'
import { Plus, Split, X } from 'lucide-react'
import { Controller, type UseFormReturn, useFieldArray } from 'react-hook-form'
import { MoneyInput } from '@/components/money-input'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCents } from '@/lib/money'
import type { CategoryOption } from '../category-options'

// O Select precisa de um texto em cada opção; "nenhuma" vira null na hora de salvar
const NONE = 'none'

type SplitsFieldProps = {
  form: UseFormReturn<TransactionFormValues>
  options: CategoryOption[]
}

/**
 * Categoria do lançamento. Normalmente é uma só; "Dividir em categorias" abre uma linha
 * por categoria com o valor de cada uma (ex.: R$ 300 no mercado = 250 de Mercado + 50 de Casa).
 * A soma precisa bater com o total, e o campo mostra quanto falta distribuir.
 */
export function SplitsField({ form, options }: SplitsFieldProps) {
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'splits' })
  const amount = form.watch('amountCents')
  const splits = form.watch('splits')
  const split = fields.length > 1
  const distributed = splits.reduce((total, item) => total + (item.amountCents || 0), 0)
  const missing = amount - distributed

  const errors = form.formState.errors.splits
  const rootError = errors?.message ?? errors?.root?.message

  const categorySelect = (index: number) => {
    // Cada categoria entra uma vez só: as já usadas nas outras linhas saem da lista
    const usedElsewhere = new Set(
      splits.flatMap((item, other) =>
        other !== index && item.categoryId ? [item.categoryId] : [],
      ),
    )
    const available = options.filter((option) => !usedElsewhere.has(option.value))
    return (
      <Controller
        control={form.control}
        name={`splits.${index}.categoryId`}
        render={({ field }) => (
          <Select
            items={[{ value: NONE, label: 'Sem categoria' }, ...available]}
            value={field.value ?? NONE}
            onValueChange={(next) => field.onChange(next === NONE ? null : next)}
          >
            <SelectTrigger
              id={index === 0 ? 'transaction-category' : undefined}
              aria-label={split ? `Categoria ${index + 1}` : undefined}
              className="w-full min-w-0"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sem categoria</SelectItem>
              {available.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            onClick={() => append({ categoryId: null, amountCents: 0 })}
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
                if (fields.length === 2) form.setValue('splits.0.amountCents', amount)
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
          onClick={() => append({ categoryId: null, amountCents: Math.max(missing, 0) })}
        >
          <Plus />
          Adicionar categoria
        </Button>
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
      </div>
      <FieldError errors={[{ message: rootError }]} />
    </Field>
  )
}
