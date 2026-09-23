import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

export const SESSION_COOKIE = 'gi_session'
const MAX_AGE = 60 * 60 * 12 // 12 horas

export type SessionPayload = { email: string; name?: string; picture?: string }

const key = () => {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET em falta ou curto (mínimo 32 caracteres)')
  return new TextEncoder().encode(secret)
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(key())
}

export async function decrypt(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ['HS256'] })
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function createSession(payload: SessionPayload) {
  const store = await cookies()
  store.set(SESSION_COOKIE, await encrypt(payload), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

export async function deleteSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getSession() {
  const store = await cookies()
  return decrypt(store.get(SESSION_COOKIE)?.value)
}
