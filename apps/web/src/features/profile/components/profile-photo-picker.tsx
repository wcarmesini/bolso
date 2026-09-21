import { Camera } from 'lucide-react'
import { type ChangeEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ACCOUNT_SUBTITLE, getInitials } from '@/lib/current-user'
import { errorMessage } from '@/lib/errors'
import { toSquareImage } from '@/lib/image'
import { useProfile, useUpdateProfile } from '../queries'

const PHOTO_SIZE = 256

type ProfilePhotoPickerProps = {
  /** Nome mostrado ao lado (acompanha o que está sendo digitado no formulário) */
  name: string
}

// A foto salva na hora, sem depender do botão "Salvar" do nome
export function ProfilePhotoPicker({ name }: ProfilePhotoPickerProps) {
  const { photo } = useProfile()
  const updateProfile = useUpdateProfile()
  const inputRef = useRef<HTMLInputElement>(null)
  const [processing, setProcessing] = useState(false)

  const busy = processing || updateProfile.isPending

  const choose = () => inputRef.current?.click()

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Limpa o campo para dar para escolher o mesmo arquivo de novo
    event.target.value = ''
    if (!file) return

    setProcessing(true)
    try {
      const dataUrl = await toSquareImage(file, PHOTO_SIZE)
      await updateProfile.mutateAsync({ image: dataUrl })
      toast.success('Foto atualizada')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível usar essa imagem.'))
    } finally {
      setProcessing(false)
    }
  }

  const remove = async () => {
    try {
      await updateProfile.mutateAsync({ image: null })
      toast.success('Foto removida')
    } catch (cause) {
      toast.error(errorMessage(cause, 'Não foi possível remover a foto.'))
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={choose}
        disabled={busy}
        aria-label={photo ? 'Alterar foto' : 'Escolher foto'}
        className="group relative shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Avatar className="size-16">
          {photo && <AvatarImage src={photo} alt="" />}
          <AvatarFallback className="bg-primary font-semibold text-lg text-primary-foreground">
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
        <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="size-5" />
        </span>
      </button>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{name}</p>
          <p className="text-muted-foreground text-xs">{ACCOUNT_SUBTITLE}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={choose} disabled={busy}>
            <Camera />
            {processing ? 'Carregando…' : photo ? 'Alterar foto' : 'Escolher foto'}
          </Button>
          {photo && (
            <Button type="button" variant="ghost" onClick={remove} disabled={busy}>
              Remover
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFileChange}
      />
    </div>
  )
}
