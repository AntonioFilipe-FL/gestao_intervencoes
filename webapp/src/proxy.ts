import { NextResponse, type NextRequest } from 'next/server'
import { decrypt, SESSION_COOKIE } from '@/lib/session'

const PUBLIC_PATHS = ['/login', '/auth', '/unauthorized']

/**
 * Verificação otimista: sem sessão válida → /login.
 * A autorização real (whitelist + papel) é feita no servidor em cada página/ação (lib/auth.ts).
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next()

  const session = await decrypt(request.cookies.get(SESSION_COOKIE)?.value)
  if (!session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.search = ''
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
