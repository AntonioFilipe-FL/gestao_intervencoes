import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { sql } from '@/lib/db'
import { createSession } from '@/lib/session'
import { appUrl, exchangeCode, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from '@/lib/google'

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
  store.delete(OAUTH_STATE_COOKIE)
  store.delete(OAUTH_VERIFIER_COOKIE)

  if (!code || !state || !verifier || state !== expectedState) {
    return NextResponse.redirect(`${base}/login?error=state`)
  }

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
    return NextResponse.redirect(`${base}/interventions`)
  } catch (e) {
    console.error('Erro no login Google:', e)
    return NextResponse.redirect(`${base}/login?error=oauth`)
  }
}
