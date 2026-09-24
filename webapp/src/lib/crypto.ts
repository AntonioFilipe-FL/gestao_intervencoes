import 'server-only'
import crypto from 'crypto'

/** Cifra simétrica (AES-256-GCM) para guardar tokens na BD. Chave derivada de AUTH_SECRET. */
const key = () => crypto.createHash('sha256').update(`${process.env.AUTH_SECRET}:google-tokens`).digest()

export function encryptSecret(plain: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.')
}

export function decryptSecret(token: string) {
  const [v, iv, tag, data] = token.split('.')
  if (v !== 'v1') throw new Error('Formato de token desconhecido')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
