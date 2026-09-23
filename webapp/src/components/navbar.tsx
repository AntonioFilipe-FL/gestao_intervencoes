import Link from 'next/link'
import { Button } from '@/components/ui/button'
import type { CurrentUser } from '@/lib/auth'

export function Navbar({ user }: { user: CurrentUser }) {

  return (
    <nav className="bg-[#cf0a2c] text-white shadow-md" style={{ fontFamily: 'var(--font-lato), Helvetica, Arial, sans-serif' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/" className="font-bold text-white" style={{ fontSize: '17px' }}>
                Gestão Intervenções
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Link
                href="/interventions"
                className="text-white/90 hover:text-white inline-flex items-center px-1 pt-1 font-medium border-b-2 border-transparent hover:border-white transition-colors"
                style={{ fontSize: '17px' }}
              >
                Intervenções
              </Link>
              <Link
                href="/interventions/new"
                className="text-white/90 hover:text-white inline-flex items-center px-1 pt-1 font-medium border-b-2 border-transparent hover:border-white transition-colors"
                style={{ fontSize: '17px' }}
              >
                Novo Registo
              </Link>
              <Link
                href="/reports"
                className="text-white/90 hover:text-white inline-flex items-center px-1 pt-1 font-medium border-b-2 border-transparent hover:border-white transition-colors"
                style={{ fontSize: '17px' }}
              >
                Relatórios
              </Link>
              <Link
                href="/settings"
                className="text-white/90 hover:text-white inline-flex items-center px-1 pt-1 font-medium border-b-2 border-transparent hover:border-white transition-colors"
                style={{ fontSize: '17px' }}
              >
                Configurações
              </Link>
            </div>
          </div>
          <form action="/auth/logout" method="post" className="flex items-center gap-3">
            <span className="hidden md:inline text-sm text-white/80">{user.email}</span>
            <Button
              type="submit"
              variant="ghost"
              className="text-white hover:bg-white/10"
              style={{ fontSize: '17px' }}
            >
              Sair
            </Button>
          </form>
        </div>
      </div>
    </nav>
  )
}
