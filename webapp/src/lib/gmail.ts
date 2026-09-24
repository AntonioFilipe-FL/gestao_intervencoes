import 'server-only'
import { sql } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'

export class GmailNotAuthorizedError extends Error {}

/** Estado da conta de envio (para o ecrã de Configurações) */
export async function getSenderStatus() {
  const rows = await sql<{ key: string; value: string | null; updated_at: Date; updated_by: string | null }[]>`
    select key, value, updated_at, updated_by from app_settings where key in ('billing_sender_email', 'billing_sender_token')`
  const token = rows.find(r => r.key === 'billing_sender_token')
  const email = rows.find(r => r.key === 'billing_sender_email')
  return {
    connected: !!token?.value,
    email: email?.value ?? null,
    connectedAt: token?.value ? token.updated_at : null,
    connectedBy: token?.value ? token.updated_by : null,
  }
}

/** Troca o refresh_token da conta de envio por um access_token válido (1 h). */
async function senderAccessToken() {
  const [t] = await sql<{ value: string | null }[]>`select value from app_settings where key = 'billing_sender_token'`
  if (!t?.value) {
    throw new GmailNotAuthorizedError('A conta de envio de emails ainda não foi ligada (Configurações → Email).')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: decryptSecret(t.value),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (body.includes('invalid_grant')) {
      // autorização revogada/expirada (ex.: mudança de palavra-passe da conta): pedir de novo
      await sql`update app_settings set value = null, updated_at = now() where key = 'billing_sender_token'`
      throw new GmailNotAuthorizedError('A autorização da conta de envio expirou. Volte a ligá-la em Configurações → Email.')
    }
    throw new Error(`Google token: ${res.status} ${body}`)
  }
  return ((await res.json()) as { access_token: string }).access_token
}

/** Cabeçalho com caracteres não-ASCII (RFC 2047) */
const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`)

/** Envia um email HTML a partir da conta de envio (fica nos "Enviados" dessa conta). */
export async function sendFromSender(opts: { from: string; fromName?: string; replyTo?: string; to: string[]; cc?: string[]; subject: string; html: string; text: string }) {
  const token = await senderAccessToken()
  const boundary = `b_${Date.now().toString(36)}`
  const headers = [
    `From: ${opts.fromName ? `${encodeHeader(opts.fromName)} <${opts.from}>` : opts.from}`,
    `To: ${opts.to.join(', ')}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.join(', ')}`] : []),
    ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
    `Subject: ${encodeHeader(opts.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
  const part = (type: string, body: string) =>
    [`--${boundary}`, `Content-Type: ${type}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', Buffer.from(body, 'utf8').toString('base64')].join('\r\n')
  const raw = [...headers, '', part('text/plain', opts.text), part('text/html', opts.html), `--${boundary}--`, ''].join('\r\n')

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: Buffer.from(raw, 'utf8').toString('base64url') }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (res.status === 403 && body.includes('insufficient')) {
      throw new GmailNotAuthorizedError('Falta a permissão de envio de emails. Volte a ligar a conta em Configurações → Email.')
    }
    throw new Error(`Gmail: ${res.status} ${body.slice(0, 300)}`)
  }
}
