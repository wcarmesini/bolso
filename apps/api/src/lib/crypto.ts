import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

/*
 * Criptografia das chaves de serviços externos (AES-256-GCM).
 * Formato salvo: iv.tag.conteúdo, cada parte em base64url.
 * Sem a ENCRYPTION_KEY, quem tiver acesso ao banco não consegue ler as chaves.
 */
export function encryptSecret(plain: string, keyHex: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  const content = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), content].map((part) => part.toString('base64url')).join('.')
}

export function decryptSecret(stored: string, keyHex: string) {
  const [iv, tag, content] = stored.split('.').map((part) => Buffer.from(part, 'base64url'))
  if (!iv || !tag || !content) throw new Error('Chave criptografada em formato inválido')
  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8')
}
