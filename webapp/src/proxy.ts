import { NextResponse, type NextRequest } from 'next/server'
import { decrypt, SESSION_COOKIE } from '@/lib/session'

// /api/cron: sem sessão, protegido por CRON_SECRET na própria rota
// manifesto, service worker e ícones da PWA de picagem: o browser pede-os sem cookies
const PUBLIC_PATHS = ['/login', '/auth', '/unauthorized', '/api/cron/', '/picagem.webmanifest', '/picagem-sw.js', '/icons/']

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
    // PWA de picagem: depois do login volta à picagem
    url.search = pathname.startsWith('/picagem') ? '?next=/picagem' : ''
    return NextResponse.redirect(url)
  }
  // o layout usa o caminho para mostrar a picagem sem menu nem avisos
  const headers = new Headers(request.headers)
  headers.set('x-pathname', pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
