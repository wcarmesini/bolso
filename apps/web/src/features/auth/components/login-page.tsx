import type { AuthProviderId } from '@bolso/shared'
import { useNavigate } from '@tanstack/react-router'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/lib/errors'
import { ProviderNotConfiguredError, signInWithProvider } from '../api'
import { authProviders } from '../providers'
import { useAuthProviders, useMe } from '../queries'

/** Motivos com que o provedor pode devolver a pessoa para cá (vêm em ?erro=) */
const errorMessages: Record<string, string> = {
  access_denied: 'Você cancelou a entrada.',
  email_does_not_match: 'Essa conta usa outro e-mail.',
  signup_disabled: 'Ainda não é possível criar conta por aqui.',
}

type LoginPageProps = {
  continueTo: string
  /** Erro devolvido pelo provedor, quando a entrada não foi concluída */
  error?: string
}

export function LoginPage({ continueTo, error }: LoginPageProps) {
  const [pending, setPending] = useState<AuthProviderId | null>(null)
  const { data: available, isPending: loadingProviders } = useAuthProviders()
  const { data: me } = useMe()
  const navigate = useNavigate()

  useEffect(() => {
    if (error) toast.error(errorMessages[error] ?? 'Não foi possível entrar. Tente de novo.')
  }, [error])

  /*
   * Quem já tem sessão não precisa entrar de novo. Vale para quem chegou aqui porque a API
   * estava fora do ar: quando ela volta, esta consulta responde e a pessoa segue viagem.
   */
  useEffect(() => {
    if (me) navigate({ to: continueTo, replace: true })
  }, [me, continueTo, navigate])

  const signIn = async (provider: AuthProviderId, nameWithArticle: string) => {
    setPending(provider)
    try {
      // Dá certo: o navegador sai daqui para a tela do provedor
      await signInWithProvider(provider, continueTo)
    } catch (cause) {
      if (cause instanceof ProviderNotConfiguredError) {
        toast.info(`Entrar com ${nameWithArticle} ainda não está configurado no servidor.`)
      } else {
        toast.error(errorMessage(cause, 'Não foi possível entrar. Tente de novo.'))
      }
      setPending(null)
    }
  }

  // Em desenvolvimento os não configurados aparecem desligados, para lembrar o que falta;
  // em produção, quem não está pronto simplesmente não aparece.
  const visible = authProviders.filter(
    ({ id }) => available?.includes(id) || (import.meta.env.DEV && !loadingProviders),
  )

  return (
    <div className="flex min-h-dvh flex-col px-4 pt-safe pb-safe">
      <main className="flex flex-1 items-center justify-center py-14">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <img src="/logo.svg" alt="" className="size-12" />
            <div>
              <h1 className="font-semibold text-xl tracking-tight">Entrar no Bolso</h1>
              <p className="mt-1 text-muted-foreground text-sm">
                Seu orçamento colaborativo, em tempo real.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {visible.map(({ id, nameWithArticle, icon: Icon }) => {
              const ready = available?.includes(id) ?? false
              return (
                <Button
                  key={id}
                  variant="outline"
                  disabled={pending !== null || !ready}
                  title={ready ? undefined : 'Falta configurar as chaves no servidor'}
                  onClick={() => signIn(id, nameWithArticle)}
                  className="h-11 w-full gap-3 font-medium text-sm"
                >
                  {pending === id ? (
                    <LoaderCircle className="size-[18px] animate-spin" />
                  ) : (
                    <Icon className="size-[18px]" />
                  )}
                  Continuar com {nameWithArticle}
                </Button>
              )
            })}
          </div>
        </div>
      </main>
    </div>
  )
}
