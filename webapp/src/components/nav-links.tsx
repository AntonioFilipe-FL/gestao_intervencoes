'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

type NavLink = { href: string; label: string; exact?: boolean }

/** Navegação secundária — FROTCOM Styleguide: 11px uppercase; ativo em bold com borda inferior de 4px */
export function NavLinks({ links }: { links: NavLink[] }) {
  const pathname = usePathname()
  const isActive = (l: NavLink) =>
    l.exact ? pathname === l.href || (pathname.startsWith(l.href + '/') && !pathname.startsWith(l.href + '/new')) : pathname.startsWith(l.href)

  return (
    <ul className="flex gap-7 overflow-x-auto">
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            aria-current={isActive(l) ? 'page' : undefined}
            className={cn(
              'inline-flex h-11 items-center border-b-4 border-transparent px-0.5 text-[11px] tracking-[0.02em] whitespace-nowrap text-fc-dark-40 uppercase transition-colors hover:text-fc-dark-100',
              isActive(l) && 'border-fc-dark-100 font-bold text-fc-dark-100'
            )}
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  )
}
