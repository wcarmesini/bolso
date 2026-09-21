import { type ProfileNameValues, profileNameSchema } from '@bolso/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { SectionHeader } from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/errors'
import { DEFAULT_DISPLAY_NAME, useProfile, useUpdateProfile } from '../queries'
import { ProfilePhotoPicker } from './profile-photo-picker'

export function ProfileSettings() {
  const { name: savedName, isPending } = useProfile()
  const updateProfile = useUpdateProfile()

  const form = useForm<ProfileNameValues>({
    resolver: zodResolver(profileNameSchema),
    defaultValues: { name: '' },
  })

  // Preenche o nome quando o perfil carrega. Depende só do nome: trocar a foto
  // não apaga um nome que a pessoa esteja digitando.
  useEffect(() => {
    form.reset({ name: savedName })
  }, [savedName, form])

  const name = form.watch('name')
  const isDirty = form.formState.isDirty

  const submit = form.handleSubmit(async (values) => {
    try {
      const saved = await updateProfile.mutateAsync({ name: values.name })
      form.reset({ name: saved.user.name })
      toast.success('Nome salvo')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível salvar.'))
    }
  })

  return (
    <>
      <SectionHeader
        title="Perfil"
        description="Seu nome e sua foto aparecem no avatar e para quem divide o grupo."
      />

      <div className="flex flex-col gap-6 rounded-xl border bg-card p-4 md:p-6">
        <ProfilePhotoPicker name={name || DEFAULT_DISPLAY_NAME} />

        <form onSubmit={submit} className="flex flex-col gap-6">
          <FieldGroup>
            <Field data-invalid={Boolean(form.formState.errors.name)}>
              <FieldLabel htmlFor="profile-name">Nome</FieldLabel>
              <Input
                id="profile-name"
                placeholder="Ex.: Wilson"
                autoComplete="name"
                disabled={isPending}
                aria-invalid={Boolean(form.formState.errors.name)}
                {...form.register('name')}
              />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="profile-email">E-mail</FieldLabel>
              <Input id="profile-email" disabled placeholder="Disponível quando o login existir" />
              <FieldDescription>
                Vai servir para entrar e receber convites de grupo.
              </FieldDescription>
            </Field>
          </FieldGroup>

          <div className="flex justify-end">
            <Button type="submit" disabled={!isDirty || form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
