import { useCallback, useState } from 'react'

const PREFIX = 'bolso:filtro:'

function ler(key: string): unknown {
  try {
    const salvo = localStorage.getItem(PREFIX + key)
    return salvo === null ? undefined : JSON.parse(salvo)
  } catch {
    // Sem armazenamento (navegação privada) ou valor estragado: vale o padrão
    return undefined
  }
}

/**
 * Estado de filtro que o navegador lembra: a pessoa volta na tela e encontra como deixou.
 *
 * Serve para o **recorte** (tipo, conta, ordem, intervalo…), não para *quando*: mês e ano
 * começam sempre no atual, senão a tela abre no passado sem ninguém pedir.
 *
 * `valido` protege de valor antigo ou de outra versão do app — sem ele, um filtro salvo
 * que não existe mais deixaria a tela vazia.
 */
export function useRemembered<T>(key: string, inicial: T, valido: (value: unknown) => boolean) {
  const [value, setValue] = useState<T>(() => {
    const salvo = ler(key)
    return salvo !== undefined && valido(salvo) ? (salvo as T) : inicial
  })

  const mudar = useCallback(
    (next: T) => {
      setValue(next)
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(next))
      } catch {
        // Sem armazenamento: o filtro vale só para esta visita
      }
    },
    [key],
  )

  return [value, mudar] as const
}

/** Ajuda comum: o valor salvo tem que ser um dos que a tela oferece hoje */
export const umDe =
  <T extends string | number>(options: readonly T[]) =>
  (value: unknown) =>
    options.includes(value as T)
