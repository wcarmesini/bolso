/**
 * Erro sobre o que a pessoa digitou num campo (ex.: nome repetido).
 * É o único tipo de mensagem que aparece junto do campo; o resto vira aviso flutuante (toast).
 */
export class FieldValidationError extends Error {
  readonly field: string

  constructor(field: string, message: string) {
    super(message)
    this.field = field
  }
}

export function errorMessage(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}
