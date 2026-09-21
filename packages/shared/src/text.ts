// Remove acentos: "Orçamento" → "Orcamento"
export function stripAccents(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * Chave de comparação de nomes: sem acento, sem maiúscula e sem espaços nas pontas.
 * "Farmácia", "farmacia" e " FARMÁCIA " viram a mesma chave — é ela que o banco usa
 * para impedir nomes repetidos.
 */
export function nameKey(name: string) {
  return stripAccents(name).trim().toLowerCase()
}
