/*
 * Lê o arquivo do banco como texto.
 *
 * Extrato brasileiro vem ora em UTF-8, ora em Latin-1 (windows-1252), e o cabeçalho informa
 * isso de várias formas — "CHARSET:1252", "ENCODING:UTF-8", `encoding="UTF-8"` — quando não
 * mente de vez. Errar a codificação estraga todo acento: "Aplicação" vira "AplicaÃ§Ã£o".
 *
 * Por isso quem decide é o **conteúdo**: UTF-8 tem regras de formação rígidas, então o texto
 * é decodificado em modo estrito e, se os bytes não forem UTF-8 válido, só então vale
 * windows-1252 — onde qualquer byte é aceito. O cabeçalho serve como confirmação, não como
 * palavra final.
 */
export async function readOfxFile(file: File) {
  const bytes = await file.arrayBuffer()
  const view = new Uint8Array(bytes)

  // Marca de UTF-8 no começo do arquivo: não há o que discutir
  if (view[0] === 0xef && view[1] === 0xbb && view[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes)
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // Bytes que não formam UTF-8: é Latin-1, como a maioria dos bancos ainda exporta
    return new TextDecoder('windows-1252').decode(bytes)
  }
}
