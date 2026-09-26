import type { ReactNode, RefObject } from 'react'
import { useRef, useState } from 'react'

/**
 * Uma fila que não cabe na tela e se puxa com a mão.
 *
 * Barra de rolagem horizontal é feia e, num punhado de cartões, desnecessária: aqui o cursor
 * vira mãozinha e arrastar desliza a fila. No dedo, o deslizar nativo já faz isso — por isso
 * só o mouse é tratado. Um arrasto não vira clique no cartão: sem esse cuidado, puxar a fila
 * trocaria de conta sem querer.
 */
export function DraggableRow({
  children,
  refDaFila,
  className = '',
}: {
  children: ReactNode
  /** Para quem precisa mexer na rolagem de fora (levar o escolhido à vista, por exemplo) */
  refDaFila?: RefObject<HTMLDivElement | null>
  className?: string
}) {
  const proprio = useRef<HTMLDivElement>(null)
  const fila = refDaFila ?? proprio
  const puxando = useRef<{ x: number; inicio: number; andou: boolean } | null>(null)
  const [pegando, setPegando] = useState(false)

  return (
    <div
      ref={fila}
      /*
       * A fila termina onde o conteúdo termina: sangrar até a beirada da janela deixava o
       * último cartão cortado fora do alinhamento de tudo o que vem embaixo.
       */
      className={`flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        pegando ? 'cursor-grabbing select-none' : 'cursor-grab'
      } ${className}`}
      onPointerDown={(event) => {
        if (event.pointerType !== 'mouse' || event.button !== 0 || !fila.current) return
        puxando.current = { x: event.clientX, inicio: fila.current.scrollLeft, andou: false }
        setPegando(true)
      }}
      onPointerMove={(event) => {
        const agarrado = puxando.current
        if (!agarrado || !fila.current) return
        const andado = event.clientX - agarrado.x
        if (Math.abs(andado) > 4) agarrado.andou = true
        fila.current.scrollLeft = agarrado.inicio - andado
      }}
      onPointerUp={() => setPegando(false)}
      onPointerLeave={() => {
        puxando.current = null
        setPegando(false)
      }}
      onClickCapture={(event) => {
        // Soltou depois de arrastar: o clique era para puxar, não para escolher
        if (puxando.current?.andou) {
          event.preventDefault()
          event.stopPropagation()
        }
        puxando.current = null
      }}
    >
      {children}
    </div>
  )
}
