// Valores sempre em centavos inteiros (R$ 10,50 = 1050): nunca float, para não errar arredondamento
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function formatCents(cents: number) {
  return brl.format(cents / 100)
}

// Digitação estilo app de banco: os dígitos entram pela direita (1 → R$ 0,01; 1234 → R$ 12,34)
export function centsFromDigits(text: string) {
  const digits = text.replace(/\D/g, '').slice(0, 13)
  return digits ? Number.parseInt(digits, 10) : 0
}

const percent = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 })

/** Quanto uma parte representa do total: formatShare(250, 1000) → "25%" */
export function formatShare(part: number, total: number) {
  return percent.format(total > 0 ? part / total : 0)
}

/** formatPercent(0.42) → "42%" */
export function formatPercent(ratio: number) {
  return percent.format(ratio)
}

const percentComCasa = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

/** Para números que ficam lado a lado numa tabela: formatSharePrecise(0.667) → "66,7%" */
export function formatSharePrecise(ratio: number) {
  return percentComCasa.format(ratio)
}
