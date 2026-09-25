import { type CategoryIconName, categoryIconNames } from '@bolso/shared'
import { searchKey } from '@/features/transactions/category-options'
import { iconSearchText } from './icons'

/*
 * Procurar ícone em português. Comparar texto cru não serve: quem escreve "Filhos" não acha
 * "filho", e quem procura "cadeados" não acha "cadeado". Então cada palavra é reduzida ao
 * radical antes de comparar, e um prefixo em comum já vale (menos que o acerto exato).
 */

const separar = (texto: string) =>
  searchKey(texto)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)

/** Tira o plural mais comum, sem encurtar demais ("filhos" → "filho", mas "mes" fica "mes") */
function raiz(palavra: string) {
  for (const sufixo of ['oes', 'aes', 'ais', 'eis', 'ns', 'es', 's']) {
    if (palavra.endsWith(sufixo) && palavra.length - sufixo.length >= 3) {
      return palavra.slice(0, -sufixo.length)
    }
  }
  return palavra
}

function combina(procurada: string, doIcone: string) {
  if (procurada === doIcone) return 3
  const a = raiz(procurada)
  const b = raiz(doIcone)
  if (a === b) return 3
  // "aluguel" acha "alugar", "cartao" acha "cartoes": basta começarem igual
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return 2
  return 0
}

/**
 * Quanto este ícone tem a ver com o que foi digitado (0 = nada).
 *
 * Palavra que aparece mais cedo no texto do ícone pesa um pouco mais: em "Bebê", "filho" é a
 * primeira palavra; em "Escola", vem depois de "colégio". Os dois casam, mas quem procura
 * "Filhos" quer ver o bebê primeiro.
 */
export function pontuarIcone(name: CategoryIconName, consulta: string) {
  const procuradas = separar(consulta).filter((palavra) => palavra.length >= 3)
  if (procuradas.length === 0) return 0
  const doIcone = separar(iconSearchText(name))
  return procuradas.reduce((total, procurada) => {
    let melhor = 0
    for (const [posicao, palavra] of doIcone.entries()) {
      const forca = combina(procurada, palavra)
      if (forca === 0) continue
      melhor = Math.max(melhor, forca * 10 - Math.min(posicao, 9))
    }
    return total + melhor
  }, 0)
}

/** Os ícones que combinam com o texto, dos que mais combinam para os que menos */
export function buscarIcones(consulta: string, limite?: number) {
  const achados = categoryIconNames
    .map((name) => ({ name, pontos: pontuarIcone(name, consulta) }))
    .filter((item) => item.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
    .map((item) => item.name)
  return limite ? achados.slice(0, limite) : achados
}
