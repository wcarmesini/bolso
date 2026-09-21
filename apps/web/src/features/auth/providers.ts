import { type AuthProviderId, authProviderIds } from '@bolso/shared'
import type { ComponentType, SVGProps } from 'react'
import { AppleIcon, GoogleIcon, MicrosoftIcon } from './components/brand-icons'

type ProviderInfo = {
  id: AuthProviderId
  /** Nome com artigo, para frases como "Continuar com o Google" */
  nameWithArticle: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
}

const byId: Record<AuthProviderId, Omit<ProviderInfo, 'id'>> = {
  google: { nameWithArticle: 'o Google', icon: GoogleIcon },
  apple: { nameWithArticle: 'a Apple', icon: AppleIcon },
  microsoft: { nameWithArticle: 'a Microsoft', icon: MicrosoftIcon },
}

// Na ordem da lista compartilhada, para a tela não mudar de ordem conforme a configuração
export const authProviders: ProviderInfo[] = authProviderIds.map((id) => ({ id, ...byId[id] }))
