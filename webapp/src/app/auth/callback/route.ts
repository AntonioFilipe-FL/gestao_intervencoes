import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { createSession } from '@/lib/session'
import { encryptSecret } from '@/lib/crypto'
import { appUrl, exchangeCode, senderEmail, OAUTH_PURPOSE_COOKIE, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from '@/lib/google'
import { getCurrentUser } from '@/lib/auth'
import { syncInBackgroundIfStale } from '@/lib/intranet'

/** Emails em ADMIN_EMAILS (separados por vírgula) são autorizados como admin no primeiro login. */
const bootstrapAdmins = () =>
  (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

export async function GET(request: Request) {
  const base = appUrl(request)
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  const store = await cookies()
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value
  const verifier = store.get(OAUTH_VERIFIER_COOKIE)?.value
  const purpose = store.get(OAUTH_PURPOSE_COOKIE)?.value
  store.delete(OAUTH_STATE_COOKIE)
  store.delete(OAUTH_VERIFIER_COOKIE)
  store.delete(OAUTH_PURPOSE_COOKIE)

  if (!code || !state || !verifier || state !== expectedState) {
    return NextResponse.redirect(`${base}/login?error=state`)
  }

  if (purpose === 'sender') return connectSender(request, base, code, verifier)

  try {
    const user = await exchangeCode(request, code, verifier)
    if (!user.email || !user.email_verified) return NextResponse.redirect(`${base}/login?error=email`)
    const email = user.email.toLowerCase()

    if (bootstrapAdmins().includes(email)) {
      await sql`insert into profiles (email, role) values (${email}, 'admin') on conflict (email) do nothing`
    }
    const [profile] = await sql`select role from profiles where email = ${email}`
    if (!profile) return NextResponse.redirect(`${base}/unauthorized`)

    await createSession({ email, name: user.name, picture: user.picture })
    // clientes e IMEIs da Intranet: atualiza em segundo plano, sem atrasar a entrada
    void syncInBackgroundIfStale(email)
    return NextResponse.redirect(`${base}/interventions`)
  } catch (e) {
    console.error('Erro no login Google:', e)
    return NextResponse.redirect(`${base}/login?error=oauth`)
  }
}

/** Guarda a autorização de envio da conta de envio (logistica@). Não altera a sessão de quem está autenticado. */
async function connectSender(request: Request, base: string, code: string, verifier: string) {
  const back = (q: string) => NextResponse.redirect(`${base}/settings?tab=email&${q}`)
  try {
    const admin = await getCurrentUser()
    if (admin?.role !== 'admin') return NextResponse.redirect(`${base}/login`)

    const account = await exchangeCode(request, code, verifier)
    const email = account.email?.toLowerCase()
    if (email !== senderEmail()) return back(`sender_error=${encodeURIComponent(`Entrou com ${email}; é preciso usar ${senderEmail()}.`)}`)
    if (!account.refreshToken) return back(`sender_error=${encodeURIComponent('A permissão de envio de emails não foi concedida.')}`)

    const rows = [
      { key: 'billing_sender_email', value: email },
      { key: 'billing_sender_token', value: encryptSecret(account.refreshToken) },
    ].map(r => ({ ...r, updated_by: admin.email }))
    await sql`insert into app_settings ${sql(rows)}
              on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`
    return back('sender_ok=1')
  } catch (e) {
    console.error('Erro a ligar conta de envio:', e)
    return back(`sender_error=${encodeURIComponent('Não foi possível concluir a autorização Google.')}`)
  }
}
