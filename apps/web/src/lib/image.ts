// Foto de celular pode ter 5–15 MB; o limite só evita travar o navegador com arquivos enormes
const MAX_FILE_BYTES = 20 * 1024 * 1024

/**
 * Recorta o centro da imagem em quadrado e reduz para `size`×`size` (JPEG).
 * Uma foto de 256px fica com uns 20–30 KB: cabe no navegador e é leve de enviar à API depois.
 */
export async function toSquareImage(file: File, size: number): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Escolha um arquivo de imagem (JPG, PNG ou WebP).')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('A imagem passa de 20 MB. Escolha uma menor.')
  }

  let bitmap: ImageBitmap
  try {
    // Já respeita a orientação da foto (celular deitado/em pé)
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('Não foi possível abrir essa imagem. Tente outra, em JPG ou PNG.')
  }

  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Seu navegador não conseguiu processar a imagem.')

  // Fundo branco: áreas transparentes (PNG) não viram preto no JPEG
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  )
  bitmap.close()

  return canvas.toDataURL('image/jpeg', 0.85)
}
