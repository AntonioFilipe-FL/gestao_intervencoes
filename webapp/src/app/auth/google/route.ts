import { NextResponse } from 'next/server'
import { authorizationUrl, createPkce, OAUTH_STATE_COOKIE, OAUTH_VERIFIER_COOKIE } from '@/lib/google'

/** Inicia o login com Google (Authorization Code + PKCE) */
export async function GET(request: Request) {
  const { state, verifier, challenge } = createPkce()
  const response = NextResponse.redirect(authorizationUrl(request, state, challenge))
  const opts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  }
  response.cookies.set(OAUTH_STATE_COOKIE, state, opts)
  response.cookies.set(OAUTH_VERIFIER_COOKIE, verifier, opts)
  return response
}
