import 'server-only'
import crypto from 'crypto'

export const OAUTH_STATE_COOKIE = 'gi_oauth_state'
export const OAUTH_VERIFIER_COOKIE = 'gi_oauth_verifier'

/** URL pública da app (no Railway: https://<serviço>.up.railway.app ou domínio próprio) */
export function appUrl(request: Request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  const proto = request.headers.get('x-forwarded-proto') ?? 'http'
  return host ? `${proto}://${host}` : new URL(request.url).origin
}

export const redirectUri = (request: Request) => `${appUrl(request)}/auth/callback`

const b64url = (buf: Buffer) => buf.toString('base64url')

export function createPkce() {
  const state = b64url(crypto.randomBytes(24))
  const verifier = b64url(crypto.randomBytes(48))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  return { state, verifier, challenge }
}

export function authorizationUrl(request: Request, state: string, challenge: string) {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.search = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID!,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()
  return url.toString()
}

export async function exchangeCode(request: Request, code: string, verifier: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      redirect_uri: redirectUri(request),
      grant_type: 'authorization_code',
      code_verifier: verifier,
    }),
  })
  if (!res.ok) throw new Error(`Google token: ${res.status} ${await res.text()}`)
  const { access_token } = (await res.json()) as { access_token: string }

  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!info.ok) throw new Error(`Google userinfo: ${info.status}`)
  return (await info.json()) as { email: string; email_verified: boolean; name?: string; picture?: string }
}
