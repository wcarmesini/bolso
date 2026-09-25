import {
  type Category,
  type CategoryFormValues,
  type CategoryKind,
  categoryFormSchema,
  categoryKindLabels,
  categoryKindsInOrder,
  categoryStyle,
  DEFAULT_CATEGORY_COLOR,
  isCategoryKind,
} from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { errorMessage, FieldValidationError } from '@/lib/errors'
import { useSaveCategory } from '../queries'
import { CategoryBadge } from './category-badge'
import { ColorPicker } from './color-picker'
import { IconPicker } from './icon-picker'

type CategoryFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Ausente = nova categoria */
  category?: Category | null
  defaultKind: CategoryKind
}

export function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  defaultKind,
}: CategoryFormDialogProps) {
  const saveCategory = useSaveCategory()

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '', kind: defaultKind, icon: 'tag', color: 'slate' },
  })

  // Cada abertura começa do zero (nova) ou com os dados da categoria (edição)
  useEffect(() => {
    if (!open) return
    form.reset(
      category
        ? { name: category.name, kind: category.kind, ...categoryStyle(category) }
        : { name: '', kind: defaultKind, icon: 'tag', color: DEFAULT_CATEGORY_COLOR },
    )
  }, [open, category, defaultKind, form])

  const [icon, color, nome] = form.watch(['icon', 'color', 'name'])

  const submit = form.handleSubmit(async (values) => {
    try {
      await saveCategory.mutateAsync({ id: category?.id, values })
      onOpenChange(false)
      toast.success(category ? 'Categoria atualizada' : 'Categoria criada')
    } catch (cause) {
      if (cause instanceof FieldValidationError && cause.field === 'name') {
        form.setError('name', { message: cause.message })
      } else {
        toast.error(errorMessage(cause, 'Não foi possível salvar.'))
      }
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-5">
          <DialogHeader>
            <DialogTitle>{category ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
            <DialogDescription>Escolha um nome, um ícone e uma cor.</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor="category-name">Nome</FieldLabel>
              <div className="flex items-center gap-3">
                <CategoryBadge icon={icon} color={color} />
                <Input
                  id="category-name"
                  placeholder="Ex.: Mercado, Academia, Farmácia"
                  autoComplete="off"
                  aria-invalid={Boolean(form.formState.errors.name)}
                  {...form.register('name')}
                />
              </div>
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel>Tipo</FieldLabel>
              <Controller
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <ToggleGroup
                    variant="outline"
                    spacing={0}
                    value={[field.value]}
                    onValueChange={(next) => {
                      // Clicar no item já ativo desmarcaria tudo: mantém o atual
                      if (isCategoryKind(next[0])) field.onChange(next[0])
                    }}
                    className="w-full"
                  >
                    {categoryKindsInOrder.map((kind) => (
                      <ToggleGroupItem key={kind} value={kind} className="flex-1">
                        {categoryKindLabels[kind]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                )}
              />
            </Field>

            <Field>
              <FieldLabel>Ícone</FieldLabel>
              <Controller
                control={form.control}
                name="icon"
                render={({ field }) => (
                  <IconPicker
                    value={field.value}
                    color={color}
                    onChange={field.onChange}
                    name={nome}
                  />
                )}
              />
            </Field>

            <Field>
              <FieldLabel>Cor</FieldLabel>
              <Controller
                control={form.control}
                name="color"
                render={({ field }) => (
                  <ColorPicker value={field.value} onChange={field.onChange} />
                )}
              />
            </Field>
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
