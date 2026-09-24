import 'server-only'
import crypto from 'crypto'

export const OAUTH_STATE_COOKIE = 'gi_oauth_state'
export const OAUTH_VERIFIER_COOKIE = 'gi_oauth_verifier'
/** 'login' (entrada normal) ou 'sender' (ligar a conta de envio de emails) */
export const OAUTH_PURPOSE_COOKIE = 'gi_oauth_purpose'

/** Conta de onde saem os emails automáticos */
export const senderEmail = () => (process.env.BILLING_EMAIL_FROM || 'logistica@pt.frotcom.com').toLowerCase()

/** Permissão para enviar emails em nome do utilizador (não dá acesso à leitura da caixa de correio). */
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

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

/** URL de autorização Google. purpose 'login' = entrar na app; 'sender' = autorizar envio de emails pela conta de envio */
export function authorizationUrl(request: Request, state: string, challenge: string, purpose: 'login' | 'sender' = 'login') {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  const common = {
    client_id: process.env.AUTH_GOOGLE_ID!,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }
  url.search = new URLSearchParams(
    purpose === 'sender'
      ? {
          ...common,
          scope: `openid email ${GMAIL_SEND_SCOPE}`,
          access_type: 'offline', // refresh_token para enviar mais tarde
          prompt: 'consent select_account',
          login_hint: senderEmail(),
        }
      : { ...common, scope: 'openid email profile', prompt: 'select_account' }
  ).toString()
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
  const tokens = (await res.json()) as { access_token: string; refresh_token?: string; scope?: string }
  const { access_token } = tokens

  const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  if (!info.ok) throw new Error(`Google userinfo: ${info.status}`)
  const user = (await info.json()) as { email: string; email_verified: boolean; name?: string; picture?: string }
  const canSend = (tokens.scope ?? '').split(' ').includes(GMAIL_SEND_SCOPE)
  return { ...user, refreshToken: canSend ? tokens.refresh_token : undefined }
}
