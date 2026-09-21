import { APIError } from 'better-auth/api'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { HttpError } from './http'

// Mensagens do Better Auth em português, pelos códigos que ele devolve
const messages: Record<string, string> = {
  YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION: 'Este convite foi enviado para outro e-mail.',
  INVITATION_NOT_FOUND: 'Convite não encontrado ou expirado.',
  USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION: 'Essa pessoa já participa do grupo.',
  USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION: 'Essa pessoa já foi convidada.',
  YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION:
    'Só quem administra o grupo pode convidar.',
  USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION: 'Você não participa desse grupo.',
  ORGANIZATION_NOT_FOUND: 'Grupo não encontrado.',
}

function toStatus(code: number): ContentfulStatusCode {
  switch (code) {
    case 401:
      return 401
    case 403:
      return 403
    case 404:
      return 404
    case 409:
      return 409
    case 429:
      return 429
    default:
      return 400
  }
}

/** Executa uma chamada do Better Auth e troca os erros dele por HttpError em português. */
export async function withAuthErrors<T>(call: () => Promise<T>, fallback: string): Promise<T> {
  try {
    return await call()
  } catch (error) {
    if (error instanceof APIError) {
      const code = typeof error.body?.code === 'string' ? error.body.code : ''
      throw new HttpError(toStatus(error.statusCode), messages[code] ?? fallback)
    }
    throw error
  }
}
