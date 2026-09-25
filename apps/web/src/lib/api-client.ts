import { FieldValidationError } from './errors'

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** 401: a sessão acabou ou não existe. As rotas do app mandam para a tela de login. */
export class UnauthorizedError extends ApiError {}

type Options = { method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown }

/**
 * Única porta de entrada para a API (/api/...). Erros viram exceções com mensagem pronta:
 * quando o problema é de um campo, vira FieldValidationError e aparece junto do campo.
 */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: options.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor.')
  }

  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const details =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {}
    /*
     * Sem { error } no corpo, quem respondeu não foi a API: é o proxy do dev ou o servidor
     * fora do ar. Dizer isso ajuda mais do que "não foi possível".
     */
    const message =
      typeof details.error === 'string'
        ? details.error
        : response.status >= 500
          ? 'O servidor não respondeu. Ele pode estar reiniciando — tente de novo em instantes.'
          : 'Não foi possível concluir a ação.'
    const field = typeof details.field === 'string' ? details.field : undefined
    if (response.status === 401) throw new UnauthorizedError(401, message)
    if (field) throw new FieldValidationError(field, message)
    throw new ApiError(response.status, message)
  }

  return data as T
}
