import {
  type IntegrationKeyFormInput,
  type IntegrationKeyFormValues,
  integrationKeyFormSchema,
  integrationProviders,
  isIntegrationProvider,
  needsClientId,
  providerMeta,
} from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { errorMessage } from '@/lib/errors'
import { useCreateIntegrationKey } from '../queries'

const providerItems = integrationProviders.map((provider) => ({
  value: provider,
  label: providerMeta[provider].label,
}))

const emptyValues: IntegrationKeyFormInput = {
  provider: 'pluggy',
  customProvider: '',
  label: '',
  clientId: '',
  secret: '',
}

type IntegrationKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function IntegrationKeyDialog({ open, onOpenChange }: IntegrationKeyDialogProps) {
  const createKey = useCreateIntegrationKey()
  const [showSecret, setShowSecret] = useState(false)

  const form = useForm<IntegrationKeyFormInput, unknown, IntegrationKeyFormValues>({
    resolver: zodResolver(integrationKeyFormSchema),
    defaultValues: emptyValues,
  })

  useEffect(() => {
    if (!open) return
    form.reset(emptyValues)
    setShowSecret(false)
  }, [open, form])

  const provider = form.watch('provider')
  const { errors } = form.formState

  const submit = form.handleSubmit(async (values) => {
    try {
      await createKey.mutateAsync(values)
      onOpenChange(false)
      toast.success('Chave adicionada')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível salvar a chave.'))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>Adicionar chave</DialogTitle>
            <DialogDescription>
              A chave é guardada criptografada no servidor e depois aparece só com o final.
            </DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="key-provider">Serviço</FieldLabel>
              <Controller
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <Select
                    items={providerItems}
                    value={field.value}
                    onValueChange={(next) => {
                      if (isIntegrationProvider(next)) field.onChange(next)
                    }}
                  >
                    <SelectTrigger id="key-provider" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providerItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>{providerMeta[provider].category}</FieldDescription>
            </Field>

            {provider === 'other' && (
              <Field data-invalid={Boolean(errors.customProvider)}>
                <FieldLabel htmlFor="key-custom-provider">Nome do serviço</FieldLabel>
                <Input
                  id="key-custom-provider"
                  placeholder="Ex.: Mercado Pago"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.customProvider)}
                  {...form.register('customProvider')}
                />
                <FieldError errors={[errors.customProvider]} />
              </Field>
            )}

            {needsClientId(provider) && (
              <Field data-invalid={Boolean(errors.clientId)}>
                <FieldLabel htmlFor="key-client-id">Client ID</FieldLabel>
                <Input
                  id="key-client-id"
                  placeholder="Cole o Client ID"
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  aria-invalid={Boolean(errors.clientId)}
                  {...form.register('clientId')}
                />
                <FieldDescription>
                  A parte pública do par. O segredo fica só no servidor do Bolso.
                </FieldDescription>
                <FieldError errors={[errors.clientId]} />
              </Field>
            )}

            <Field data-invalid={Boolean(errors.label)}>
              <FieldLabel htmlFor="key-label">Apelido (opcional)</FieldLabel>
              <Input
                id="key-label"
                placeholder="Ex.: Conta pessoal, Testes"
                autoComplete="off"
                aria-invalid={Boolean(errors.label)}
                {...form.register('label')}
              />
              <FieldError errors={[errors.label]} />
            </Field>

            <Field data-invalid={Boolean(errors.secret)}>
              <FieldLabel htmlFor="key-secret">
                {needsClientId(provider) ? 'Client Secret' : 'Chave'}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="key-secret"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="Cole a chave aqui"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={Boolean(errors.secret)}
                  className="font-mono"
                  {...form.register('secret')}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={showSecret ? 'Esconder chave' : 'Mostrar chave'}
                    onClick={() => setShowSecret((value) => !value)}
                  >
                    {showSecret ? <EyeOff /> : <Eye />}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldError errors={[errors.secret]} />
            </Field>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Salvando…' : 'Salvar chave'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
