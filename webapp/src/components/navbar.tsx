import Link from 'next/link'
import type { CurrentUser } from '@/lib/auth'
import { NavLinks } from '@/components/nav-links'

export function Navbar({ user }: { user: CurrentUser }) {
  const links = [
    { href: '/interventions', label: 'Intervenções', exact: true },
    ...(user.role === 'admin' ? [{ href: '/interventions/new', label: 'Novo registo' }] : []),
    { href: '/stock', label: 'Stock Material' },
    { href: '/reports', label: 'Relatórios' },
    ...(user.role === 'admin' ? [{ href: '/settings', label: 'Configurações' }] : []),
  ]

  return (
    <header>
      {/* Barra superior */}
      <div className="bg-fc-dark-100 text-white">
        <div className="mx-auto flex h-12 max-w-screen-2xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center">
            <Link href="/interventions" className="flex shrink-0 items-center gap-3">
              <span className="h-6 w-1.5 bg-fc-red" aria-hidden />
              <span className="text-[15px] font-bold tracking-[0.04em] uppercase">Frotcom</span>
              <span className="hidden text-[13px] font-light tracking-[0.02em] text-fc-dark-40 uppercase lg:inline">Gestão de intervenções</span>
            </Link>
            {/* separador + menu na barra de topo */}
            <span className="mx-6 h-6 w-px shrink-0 bg-fc-dark-80" aria-hidden />
            <nav className="min-w-0">
              <NavLinks links={links} />
            </nav>
          </div>
          <form action="/auth/logout" method="post" className="ml-4 flex shrink-0 items-center gap-4">
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
    </header>
  )
}
