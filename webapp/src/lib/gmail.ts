import 'server-only'
import { sql } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'

export class GmailNotAuthorizedError extends Error {}

/** Troca o refresh_token guardado do utilizador por um access_token válido (1 h). */
async function accessTokenFor(email: string) {
  const [p] = await sql<{ google_refresh_token: string | null }[]>`
    select google_refresh_token from profiles where email = ${email.toLowerCase()}`
  if (!p?.google_refresh_token) {
    throw new GmailNotAuthorizedError('A sua conta ainda não autorizou o envio de emails. Saia e volte a entrar na aplicação.')
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      refresh_token: decryptSecret(p.google_refresh_token),
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (body.includes('invalid_grant')) {
      // autorização revogada ou expirada: limpar para pedir de novo no próximo login
      await sql`update profiles set google_refresh_token = null where email = ${email.toLowerCase()}`
      throw new GmailNotAuthorizedError('A autorização de envio de emails expirou. Saia e volte a entrar na aplicação.')
    }
    throw new Error(`Google token: ${res.status} ${body}`)
  }
  return ((await res.json()) as { access_token: string }).access_token
}

/** Cabeçalho com caracteres não-ASCII (RFC 2047) */
const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v, 'utf8').toString('base64')}?=`)

/** Envia um email HTML a partir da conta Gmail do utilizador (fica nos "Enviados" dele). */
export async function sendAsUser(opts: { from: string; fromName?: string; to: string[]; cc?: string[]; subject: string; html: string; text: string }) {
  const token = await accessTokenFor(opts.from)
  const boundary = `b_${Date.now().toString(36)}`
  const headers = [
    `From: ${opts.fromName ? `${encodeHeader(opts.fromName)} <${opts.from}>` : opts.from}`,
    `To: ${opts.to.join(', ')}`,
    ...(opts.cc?.length ? [`Cc: ${opts.cc.join(', ')}`] : []),
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
      throw new GmailNotAuthorizedError('Falta a permissão de envio de emails. Saia e volte a entrar na aplicação.')
    }
    throw new Error(`Gmail: ${res.status} ${body.slice(0, 300)}`)
  }
}
