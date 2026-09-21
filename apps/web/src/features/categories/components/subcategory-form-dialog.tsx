import {
  type Category,
  categoryStyle,
  type SubcategoryFormValues,
  subcategoryFormSchema,
} from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
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
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { useSaveSubcategory } from '../queries'
import { CategoryBadge } from './category-badge'

type SubcategoryFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Categoria principal onde a subcategoria fica */
  parent: Category | null
  /** Ausente = nova subcategoria */
  subcategory?: Category | null
}

export function SubcategoryFormDialog({
  open,
  onOpenChange,
  parent,
  subcategory,
}: SubcategoryFormDialogProps) {
  const saveSubcategory = useSaveSubcategory()

  const form = useForm<SubcategoryFormValues>({
    resolver: zodResolver(subcategoryFormSchema),
    defaultValues: { name: '' },
  })

  useEffect(() => {
    if (open) form.reset({ name: subcategory?.name ?? '' })
  }, [open, subcategory, form])

  const submit = form.handleSubmit(async (values) => {
    if (!parent) return
    try {
      await saveSubcategory.mutateAsync({ id: subcategory?.id, parentId: parent.id, values })
      onOpenChange(false)
      toast.success(subcategory ? 'Subcategoria atualizada' : 'Subcategoria criada')
    } catch (cause) {
      if (cause instanceof FieldValidationError && cause.field === 'name') {
        form.setError('name', { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível salvar.'))
      }
    }
  })

  const nameError = form.formState.errors.name

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{subcategory ? 'Editar subcategoria' : 'Nova subcategoria'}</DialogTitle>
            <DialogDescription>
              Subcategorias usam o ícone e a cor da categoria principal.
            </DialogDescription>
          </DialogHeader>

          {parent && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-3 py-2">
              <CategoryBadge {...categoryStyle(parent)} />
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">Dentro de</p>
                <p className="truncate font-medium text-sm">{parent.name}</p>
              </div>
            </div>
          )}

          <Field data-invalid={Boolean(nameError)}>
            <FieldLabel htmlFor="subcategory-name">Nome</FieldLabel>
            <Input
              id="subcategory-name"
              placeholder="Ex.: Aluguel, Farmácia, Delivery"
              autoComplete="off"
              aria-invalid={Boolean(nameError)}
              {...form.register('name')}
            />
            <FieldError errors={[nameError]} />
          </Field>

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
