import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

/*
 * Arrastar o conteúdo para o lado com o mouse, como num mapa. No toque o navegador já
 * faz isso sozinho, então só vale para ponteiro fino. A mãozinha (cursor) só aparece
 * quando há mesmo o que arrastar.
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const origin = useRef<{ x: number; scrollLeft: number } | null>(null)
  const [canDrag, setCanDrag] = useState(false)
  const [dragging, setDragging] = useState(false)

  // Só faz sentido quando o conteúdo é mais largo que a área visível
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const check = () => setCanDrag(element.scrollWidth > element.clientWidth + 1)
    check()
    const observer = new ResizeObserver(check)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => observer.disconnect()
  })

  const onPointerDown = useCallback((event: ReactPointerEvent<T>) => {
    const element = ref.current
    if (!element || event.pointerType !== 'mouse' || event.button !== 0) return
    if (element.scrollWidth <= element.clientWidth) return
    // Cliques em botões e links continuam sendo cliques
    if ((event.target as HTMLElement).closest('button, a, input, select, [role="button"]')) return
    origin.current = { x: event.clientX, scrollLeft: element.scrollLeft }
    element.setPointerCapture(event.pointerId)
    setDragging(true)
  }, [])

  const onPointerMove = useCallback((event: ReactPointerEvent<T>) => {
    const element = ref.current
    const start = origin.current
    if (!element || !start) return
    element.scrollLeft = start.scrollLeft - (event.clientX - start.x)
  }, [])

  const stop = useCallback((event: ReactPointerEvent<T>) => {
    const element = ref.current
    if (!element || !origin.current) return
    origin.current = null
    setDragging(false)
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId)
  }, [])

  return {
    ref,
    dragging,
    /** Classes e eventos para o elemento que rola */
    dragProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stop,
      onPointerCancel: stop,
      className: canDrag
        ? dragging
          ? 'cursor-grabbing select-none'
          : 'pointer-fine:cursor-grab'
        : '',
    },
  }
}
