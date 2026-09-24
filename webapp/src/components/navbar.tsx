import Link from 'next/link'
import type { CurrentUser } from '@/lib/auth'
import { NavLinks } from '@/components/nav-links'

export function Navbar({ user }: { user: CurrentUser }) {
  const links = [
    { href: '/interventions', label: 'Intervenções', exact: true },
    ...(user.role === 'admin' ? [{ href: '/interventions/new', label: 'Novo registo' }] : []),
    { href: '/reports', label: 'Relatórios' },
    { href: '/settings', label: 'Configurações' },
  ]

  return (
    <header>
      {/* Barra superior */}
      <div className="bg-fc-dark-100 text-white">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/interventions" className="flex items-center gap-3">
            <span className="h-6 w-1.5 bg-fc-red" aria-hidden />
            <span className="text-[15px] font-bold tracking-[0.04em] uppercase">Frotcom</span>
            <span className="text-[13px] font-light tracking-[0.02em] text-fc-dark-40 uppercase">Gestão de intervenções</span>
          </Link>
          <form action="/auth/logout" method="post" className="flex items-center gap-4">
            <span className="hidden text-[12px] text-fc-dark-40 md:inline">{user.email}</span>
            <button
              type="submit"
              className="cursor-pointer text-[11px] tracking-[0.02em] text-fc-dark-40 uppercase transition-colors hover:text-white"
            >
              Sair
            </button>
          </form>
        </div>
      </div>
      {/* Navegação secundária */}
      <nav className="border-b border-fc-dark-10 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <NavLinks links={links} />
        </div>
      </nav>
    </header>
  )
}
