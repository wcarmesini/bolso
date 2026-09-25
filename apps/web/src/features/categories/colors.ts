import { categoryPalette } from '@bolso/shared'
import type { CSSProperties } from 'react'

/*
 * Exceção à regra "só tokens": esta é cor de DADO (identifica a categoria em listas e
 * gráficos), não do tema.
 *
 * O **fundo do selo é a cor escolhida**, sempre — só diluída, para não brigar com a tela.
 * Quem se adapta é o **traço**: um rosa clarinho sumiria no tema claro, e um azul-marinho no
 * escuro, então o ícone é a mesma cor com a luminosidade ajustada até ter contraste suficiente
 * com aquele fundo. O tom (matiz e saturação) continua o que a pessoa escolheu; muda só o
 * brilho, e só o quanto for preciso.
 */

/*
 * Fundos de cada tema, no pior caso para o ícone: no claro, o cinza do fundo da página (mais
 * escuro que o branco do card); no escuro, o cinza do card (mais claro que o fundo da página).
 */
const FUNDO_CLARO = '#f7f7f8'
const FUNDO_ESCURO = '#18181b'
/* Ícone e texto pequeno colorido: 3.6:1 deixa legível sem descaracterizar a cor */
const CONTRASTE_ALVO = 3.6
/* Quanto da cor entra no fundo do badge (o mesmo valor está em styles.css) */
const TINTA = 0.16

type Hsl = { h: number; s: number; l: number }

export function hexToHsl(hex: string): Hsl {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l: Math.round(l * 100) }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h =
    max === r
      ? ((g - b) / d + (g < b ? 6 : 0)) * 60
      : max === g
        ? ((b - r) / d + 2) * 60
        : ((r - g) / d + 4) * 60
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) }
}

export function hslToHex(h: number, s: number, l: number) {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
  const canal = (n: number) => {
    const k = (n + h / 30) % 12
    const cor = l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * cor)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${canal(0)}${canal(8)}${canal(4)}`
}

/** Luminância relativa (WCAG): o quanto a cor "ilumina" a tela, de 0 a 1 */
function luminancia(hex: string) {
  const canal = (inicio: number) => {
    const valor = Number.parseInt(hex.slice(inicio, inicio + 2), 16) / 255
    return valor <= 0.03928 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(1) + 0.7152 * canal(3) + 0.0722 * canal(5)
}

/** A cor da frente com transparência, resolvida sobre o fundo: o que o olho de fato vê */
function compor(frente: string, fundo: string, alpha: number) {
  const canal = (inicio: number) => {
    const f = Number.parseInt(frente.slice(inicio, inicio + 2), 16)
    const t = Number.parseInt(fundo.slice(inicio, inicio + 2), 16)
    return Math.round(f * alpha + t * (1 - alpha))
      .toString(16)
      .padStart(2, '0')
  }
  return `#${canal(1)}${canal(3)}${canal(5)}`
}

/** Razão de contraste entre duas cores, de 1 (igual) a 21 (preto no branco) */
export function contraste(a: string, b: string) {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return ((claro ?? 0) + 0.05) / ((escuro ?? 0) + 0.05)
}

/*
 * A mesma cor, clareada ou escurecida só até passar do contraste alvo com o fundo. Procura a
 * luminosidade mais próxima da original que já serve (busca binária), em vez de chutar um
 * valor fixo: assim um vermelho forte quase não muda, e um amarelo claro escurece o bastante.
 */
const memoria = new Map<string, string>()

export function legivelSobre(hex: string, fundo: string) {
  const chave = `${hex}|${fundo}`
  const pronta = memoria.get(chave)
  if (pronta) return pronta

  const { h, s, l } = hexToHsl(hex)
  const fundoClaro = luminancia(fundo) > 0.4
  let resultado = hex

  /*
   * O alvo é o fundo do selo: a cor escolhida diluída sobre o fundo do tema. Medir contra o
   * branco puro engana — um rosa claro passaria, e o ícone continuaria sumindo no rosado.
   */
  const fundoDoSelo = compor(hex, fundo, TINTA)
  const serve = (tom: string) => contraste(tom, fundoDoSelo) >= CONTRASTE_ALVO

  if (!serve(hex)) {
    // No claro a cor precisa escurecer; no escuro, clarear
    let baixo = fundoClaro ? 0 : l
    let alto = fundoClaro ? l : 100
    for (let passo = 0; passo < 12; passo += 1) {
      const meio = (baixo + alto) / 2
      const tentativa = hslToHex(h, s, meio)
      if (serve(tentativa)) {
        resultado = tentativa
        // Volta na direção da cor original, para não passar do ponto
        if (fundoClaro) baixo = meio
        else alto = meio
      } else if (fundoClaro) {
        alto = meio
      } else {
        baixo = meio
      }
    }
  }

  memoria.set(chave, resultado)
  return resultado
}

/**
 * As variáveis que as classes `cat-badge` e `cat-swatch` (styles.css) usam: a cor escolhida
 * e as duas versões legíveis, uma para cada tema. Ficam as duas no elemento, e o CSS escolhe
 * — assim trocar de tema não precisa recalcular nada.
 */
export const categoryColorVar = (color: string) =>
  ({
    '--cat': color,
    '--cat-claro': legivelSobre(color, FUNDO_CLARO),
    '--cat-escuro': legivelSobre(color, FUNDO_ESCURO),
    // Para o que é desenhado EM CIMA da cor pura (o "check" da bolinha escolhida)
    '--cat-sobre': contraste(color, '#ffffff') > 2.5 ? '#ffffff' : '#18181b',
  }) as CSSProperties

/** Cores prontas do seletor, agrupadas por família para a grade ficar legível */
export const colorGroups: { label: string; colors: string[] }[] = [
  {
    label: 'Vivas',
    colors: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e'],
  },
  {
    label: 'Frias',
    colors: ['#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1'],
  },
  {
    label: 'Doces',
    colors: ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#fb7185'],
  },
  {
    label: 'Discretas',
    colors: ['#78716c', '#71717a', '#64748b', '#475569', '#0f766e', '#7c2d12'],
  },
]

/** A próxima cor da paleta que ainda não está em uso (para categorias criadas na hora) */
export function nextFreeColor(usadas: Iterable<string | null>) {
  const jaUsadas = new Set([...usadas].filter(Boolean))
  return categoryPalette.find((color) => !jaUsadas.has(color)) ?? categoryPalette[0]
}
