import { createHash } from 'node:crypto'

/*
 * O que fica guardado de uma chave da API é o hash dela, não a chave.
 *
 * SHA-256 sem sal, de propósito: a chave são 32 bytes sorteados, não uma senha que alguém
 * inventou. Não há lista de palavras que a adivinhe, e o hash direto deixa a conferência ser
 * uma busca por índice — a cada chamada da API.
 */
export const hashApiKey = (token: string) => createHash('sha256').update(token).digest('hex')
