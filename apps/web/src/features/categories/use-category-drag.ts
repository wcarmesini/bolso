import { useCallback, useEffect, useRef, useState } from 'react'

/** Uma lista arrastável: a raiz (as principais) ou as filhas de uma principal */
export type DragZone = { parentId: string | null; ids: string[] }

export type DragTarget = {
  parentId: string | null
  index: number
  /** Onde desenhar a linha de "cai aqui", em coordenadas de tela */
  linha: { left: number; width: number; top: number }
}

type Estado = {
  id: string
  nivel: 'principal' | 'sub'
  origem: string | null
  rect: DOMRect
  inicio: { x: number; y: number }
  ponteiro: { x: number; y: number }
  alvo: DragTarget | null
}

type Medidas = {
  /** Âncora barata para saber se a página rolou desde a medição */
  ancora: number
  raiz: DOMRect[]
  grupos: { parentId: string; rect: DOMRect; rects: DOMRect[] }[]
}

type Props = {
  zonas: DragZone[]
  onDrop: (mudanca: { id: string; de: string | null; para: string | null; index: number }) => void
}

/**
 * Arrastar categorias, em dois níveis: as principais entre si e as subcategorias dentro da
 * principal — **ou para outra principal**, soltando em cima dela.
 *
 * O item arrastado vira um clone solto na tela (ver `CloneArrastado`), em vez de empurrar a
 * lista: assim ele não é cortado pelas bordas do grupo nem some ao passar de um para outro.
 * O lugar onde vai cair aparece como uma linha fina entre os itens.
 *
 * As posições são medidas **a cada movimento**, não no começo: enquanto se arrasta, os grupos
 * vazios abrem espaço para receber, e uma medida velha apontaria para o lugar errado.
 *
 * Para não pesar, o movimento não passa pelo React: a cópia é reposicionada direto no DOM, uma
 * vez por quadro. O estado só muda quando o **destino** muda — aí sim a lista se redesenha,
 * o que acontece poucas vezes por arrasto em vez de a cada pixel.
 */
/** A partir de quantos pixels da borda a tela começa a acompanhar o arrasto */
const BORDA = 90
const VELOCIDADE_MAXIMA = 18

/** Quem rola nesta tela: o contêiner com barra de rolagem mais próximo, ou a janela */
function roladorDe(element: HTMLElement | null) {
  for (let atual = element; atual; atual = atual.parentElement) {
    const estilo = getComputedStyle(atual)
    if (/auto|scroll/.test(estilo.overflowY) && atual.scrollHeight > atual.clientHeight + 1) {
      return atual
    }
  }
  return null
}

export function useCategoryDrag({ zonas, onDrop }: Props) {
  const itens = useRef(new Map<string, HTMLElement>())
  const [estado, setEstado] = useState<Estado | null>(null)
  /** A cópia que segue o dedo e a linha de destino: movidas no DOM, sem re-renderizar nada */
  const cloneRef = useRef<HTMLDivElement | null>(null)
  const linhaRef = useRef<HTMLSpanElement | null>(null)
  const grupoAceso = useRef<HTMLElement | null>(null)
  const atual = useRef<Estado | null>(null)
  const pendente = useRef<{ x: number; y: number } | null>(null)
  const quadro = useRef(0)
  /*
   * As posições de todas as linhas, medidas UMA vez por arrasto. Medir a cada quadro obriga o
   * navegador a recalcular o layout da página inteira — com uma lista grande, num celular,
   * é o que fazia o arrasto engasgar. A lista não se mexe enquanto se arrasta, então uma
   * medida serve para todo o gesto; se a página rolar, ela é refeita.
   */
  const medidas = useRef<Medidas | null>(null)

  // Um arrasto interrompido (aba trocada, componente desmontado) não pode deixar quadro pendente
  useEffect(() => () => cancelAnimationFrame(quadro.current), [])

  const registrarItem = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element) itens.current.set(id, element)
      else itens.current.delete(id)
    },
    [],
  )

  const rectDe = (id: string) => itens.current.get(id)?.getBoundingClientRect()

  const rectsDe = (ids: string[]) =>
    ids.flatMap((id) => {
      const rect = rectDe(id)
      return rect ? [rect] : []
    })

  const indiceEm = (rects: DOMRect[], y: number) =>
    rects.filter((rect) => y > rect.top + rect.height / 2).length

  /*
   * A linha fica em cima do item que vai ser empurrado para baixo; no fim da lista, logo
   * abaixo do último. Lista vazia (uma principal sem filhas): dentro do bloco dela, recuada
   * como ficariam as subcategorias.
   */
  const linhaEm = (rects: DOMRect[], index: number, bloco: DOMRect) => {
    const alvo = rects[index]
    if (alvo) return { left: alvo.left, width: alvo.width, top: alvo.top }
    const ultimo = rects.at(-1)
    if (ultimo) return { left: ultimo.left, width: ultimo.width, top: ultimo.bottom }
    return { left: bloco.left + 44, width: Math.max(bloco.width - 56, 40), top: bloco.bottom - 10 }
  }

  const medirTudo = (id: string): Medidas => ({
    ancora: rectDe(id)?.top ?? 0,
    raiz: rectsDe(zonas.find((zona) => zona.parentId === null)?.ids ?? []),
    grupos: zonas.flatMap((zona) => {
      if (zona.parentId === null) return []
      const rect = rectDe(zona.parentId)
      return rect ? [{ parentId: zona.parentId, rect, rects: rectsDe(zona.ids) }] : []
    }),
  })

  /** Em que lista, e entre quais itens dela, o ponteiro está agora */
  const alvoDe = (nivel: Estado['nivel'], y: number, atuais: Medidas): DragTarget | null => {
    if (nivel === 'principal') {
      const rects = atuais.raiz
      const primeiro = rects[0]
      if (!primeiro) return null
      const index = indiceEm(rects, y)
      return { parentId: null, index, linha: linhaEm(rects, index, primeiro) }
    }

    /*
     * Subcategoria: a área de cada principal é o bloco inteiro dela (o cabeçalho mais as
     * filhas), e não só a lista de filhas. Assim dá para soltar em cima do nome da principal,
     * que é o gesto natural — e uma principal sem filhas também recebe.
     */
    const grupos = atuais.grupos
    const primeiro = grupos[0]
    if (!primeiro) return null

    const distancia = (grupo: (typeof grupos)[number]) =>
      y < grupo.rect.top ? grupo.rect.top - y : y > grupo.rect.bottom ? y - grupo.rect.bottom : 0

    const dentro =
      grupos.find((grupo) => y >= grupo.rect.top && y <= grupo.rect.bottom) ??
      // Passou do fim (ou do começo) da lista: vale o grupo mais próximo
      grupos.reduce((maisPerto, grupo) =>
        distancia(grupo) < distancia(maisPerto) ? grupo : maisPerto,
      )

    const index = indiceEm(dentro.rects, y)
    return {
      parentId: dentro.parentId,
      index,
      linha: linhaEm(dentro.rects, index, dentro.rect),
    }
  }

  /*
   * Um quadro de arrasto: descobre para onde o item iria, mexe na cópia, na linha de destino
   * e no realce do grupo — tudo direto no DOM — e, se o dedo estiver na borda da tela, rola e
   * se agenda de novo. Nada disso passa pelo React: redesenhar a lista a cada pixel engasga.
   */
  const aplicarQuadro = () => {
    quadro.current = 0
    const posicao = pendente.current
    const arrasto = atual.current
    if (!posicao || !arrasto) return

    /*
     * No primeiro movimento a lista já abriu os espaços de destino, o que pode ter empurrado
     * o item para baixo: remede e reancora, para a cópia não dar um salto.
     */
    const primeiro = arrasto.alvo === null
    const rect = primeiro ? (rectDe(arrasto.id) ?? arrasto.rect) : arrasto.rect
    const inicio = primeiro ? posicao : arrasto.inicio

    // Uma leitura por quadro, só para saber se a tela rolou desde a última medição
    const ancora = rectDe(arrasto.id)?.top ?? 0
    if (primeiro || !medidas.current || Math.abs(medidas.current.ancora - ancora) > 0.5) {
      medidas.current = medirTudo(arrasto.id)
    }
    const alvo = alvoDe(arrasto.nivel, posicao.y, medidas.current)

    if (cloneRef.current) {
      cloneRef.current.style.transform = `translateY(${posicao.y - inicio.y}px)`
    }
    const linha = linhaRef.current
    if (linha) {
      linha.style.display = alvo ? '' : 'none'
      if (alvo) {
        linha.style.left = `${alvo.linha.left}px`
        linha.style.top = `${alvo.linha.top - 1}px`
        linha.style.width = `${alvo.linha.width}px`
      }
    }

    // O grupo que vai receber acende; o de antes apaga
    const recebendo =
      arrasto.nivel === 'sub' && alvo?.parentId && alvo.parentId !== arrasto.origem
        ? (itens.current.get(alvo.parentId) ?? null)
        : null
    if (grupoAceso.current !== recebendo) {
      grupoAceso.current?.classList.remove('grupo-recebendo')
      recebendo?.classList.add('grupo-recebendo')
      grupoAceso.current = recebendo
    }

    atual.current = { ...arrasto, rect, inicio, ponteiro: posicao, alvo }
    // Só o primeiro quadro redesenha: é quando a cópia e os espaços aparecem
    if (primeiro) setEstado(atual.current)

    /*
     * Perto do topo ou da base, a tela acompanha o arrasto. Sem isso, numa lista que não cabe
     * na janela é impossível levar uma categoria lá de baixo para o começo: o dedo chega na
     * borda e o arrasto para ali.
     */
    if (rolarSePerto(posicao.y, arrasto.id)) {
      medidas.current = null
      agendar()
    }
  }

  const agendar = () => {
    if (quadro.current) return
    quadro.current = requestAnimationFrame(aplicarQuadro)
  }

  /** Rola quando o ponteiro está na borda; devolve se rolou, para o arrasto continuar vivo */
  const rolarSePerto = (y: number, id: string) => {
    const acima = y - BORDA
    const abaixo = y - (window.innerHeight - BORDA)
    const empurrao =
      acima < 0
        ? Math.max(acima / BORDA, -1) * VELOCIDADE_MAXIMA
        : abaixo > 0
          ? Math.min(abaixo / BORDA, 1) * VELOCIDADE_MAXIMA
          : 0
    if (empurrao === 0) return false

    const rolador = roladorDe(itens.current.get(id) ?? null)
    const antes = rolador ? rolador.scrollTop : window.scrollY
    if (rolador) rolador.scrollTop += empurrao
    else window.scrollBy(0, empurrao)
    const depois = rolador ? rolador.scrollTop : window.scrollY
    // Já está no fim (ou no começo): não adianta continuar acordando o quadro
    return depois !== antes
  }

  const alcaProps = (
    id: string,
    nivel: Estado['nivel'],
    origem: string | null,
    rotulo: string,
  ) => ({
    'aria-label': `Arrastar ${rotulo} para outra posição`,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      const rect = rectDe(id)
      if (!rect) return
      medidas.current = null
      const comecou: Estado = {
        id,
        nivel,
        origem,
        rect,
        inicio: { x: event.clientX, y: event.clientY },
        ponteiro: { x: event.clientX, y: event.clientY },
        alvo: null,
      }
      atual.current = comecou
      setEstado(comecou)
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      pendente.current = { x: event.clientX, y: event.clientY }
      agendar()
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      event.currentTarget.releasePointerCapture(event.pointerId)
      cancelAnimationFrame(quadro.current)
      quadro.current = 0
      grupoAceso.current?.classList.remove('grupo-recebendo')
      grupoAceso.current = null
      const arrasto = atual.current
      if (arrasto?.alvo) {
        onDrop({
          id: arrasto.id,
          de: arrasto.origem,
          para: arrasto.alvo.parentId,
          index: arrasto.alvo.index,
        })
      }
      atual.current = null
      setEstado(null)
    },
    onPointerCancel: () => {
      cancelAnimationFrame(quadro.current)
      quadro.current = 0
      grupoAceso.current?.classList.remove('grupo-recebendo')
      grupoAceso.current = null
      atual.current = null
      setEstado(null)
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      // Sem mouse também dá: com a alça focada, as setas movem o item dentro da lista dele
      const zona = zonas.find((item) => item.parentId === origem)
      if (!zona) return
      const atual = zona.ids.indexOf(id)
      const destino =
        event.key === 'ArrowUp' ? atual - 1 : event.key === 'ArrowDown' ? atual + 1 : -1
      if (destino < 0 || destino >= zona.ids.length) return
      event.preventDefault()
      onDrop({ id, de: origem, para: origem, index: destino })
    },
  })

  return {
    registrarItem,
    alcaProps,
    cloneRef,
    linhaRef,
    /** O que está sendo arrastado agora (para desenhar o clone e apagar o original) */
    arrastando: estado && {
      id: estado.id,
      nivel: estado.nivel,
      origem: estado.origem,
      rect: estado.rect,
      alvo: estado.alvo,
    },
    /** Onde desenhar a linha de "vai cair aqui" (em coordenadas de tela) */
    linha: estado?.alvo?.linha ?? null,
  }
}
