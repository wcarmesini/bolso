const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Centavos inteiros para texto, só para mensagens de erro ("R$ 1.000,00") */
export const formatCents = (cents: number) => brl.format(cents / 100)
