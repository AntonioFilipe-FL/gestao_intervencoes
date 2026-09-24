import { NextResponse } from 'next/server'
import { authorizationUrl, createPkce, OAUTH_PURPOSE_COOKIE, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from '@/lib/google'
import { getCurrentUser } from '@/lib/auth'

/**
 * Inicia o fluxo Google (Authorization Code + PKCE).
 *   /auth/google              → login na aplicação
 *   /auth/google?purpose=sender → (só admins) ligar a conta de envio de emails (logistica@)
 */
export async function GET(request: Request) {
  const purpose = new URL(request.url).searchParams.get('purpose') === 'sender' ? 'sender' : 'login'
  if (purpose === 'sender') {
    const user = await getCurrentUser()
    if (user?.role !== 'admin') return NextResponse.redirect(new URL('/settings', request.url))
  }
  const { state, verifier, challenge } = createPkce()
  const response = NextResponse.redirect(authorizationUrl(request, state, challenge, purpose))
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  }
  response.cookies.set(OAUTH_STATE_COOKIE, state, opts)
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, opts)
  response.cookies.set(OAUTH_PURPOSE_COOKIE, purpose, opts)
  return response
}
