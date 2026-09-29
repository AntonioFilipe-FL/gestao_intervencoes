'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type NavLink = { href: string; label: string; exact?: boolean }

/** Menu na barra de topo (fundo escuro) — FROTCOM Styleguide: 11px uppercase; ativo em bold/branco com borda inferior de 4px */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  const isActive = (l: NavLink) =>
    l.exact ? pathname === l.href || (pathname.startsWith(l.href + '/') && !pathname.startsWith(l.href + '/new')) : pathname.startsWith(l.href)

  return (
    <ul className="flex gap-6 overflow-x-auto">
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={isActive(l) ? 'page' : undefined}
            className={cn(
              'inline-flex h-12 items-center border-b-4 border-transparent px-0.5 pt-1 text-[11px] tracking-[0.02em] whitespace-nowrap text-fc-dark-40 uppercase transition-colors hover:text-white',
              isActive(l) && 'border-fc-red font-bold text-white'
            )}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
