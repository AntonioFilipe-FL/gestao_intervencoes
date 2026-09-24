import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Paginação — FROTCOM Styleguide v0.5
 * normal: 12px blue-light-100, fundo grey-light-80, borda blue-dark-40
 * ativo: branco sobre blue-light-100 · hover: fundo blue-dark-10 · desativado: blue-dark-40
 */
export function Pagination({ current, total, href }: { current: number; total: number; href: (p: number) => string }) {
  if (total <= 1) return null

  const pages: (number | '…')[] = []
  const window = 2
  for (let p = 1; p <= total; p++) {
    if (p === 1 || p === total || Math.abs(p - current) <= window) pages.push(p)
    else if (pages[pages.length - 1] !== '…') pages.push('…')
  }

  const base = 'inline-flex h-[26px] min-w-[26px] items-center justify-center border border-fc-dark-40 -ml-px px-2 text-[12px] first:ml-0 first:rounded-l-[2px] last:rounded-r-[2px]'
  const normal = 'bg-fc-grey-80 text-fc-light-100 hover:bg-fc-dark-10'
  const disabled = 'bg-fc-grey-80 text-fc-dark-40 pointer-events-none'

  return (
    <nav aria-label="Paginação" className="flex">
      <Link href={href(current - 1)} aria-disabled={current <= 1} className={cn(base, current <= 1 ? disabled : normal)}>«</Link>
      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} className={cn(base, disabled)}>…</span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === current ? 'page' : undefined}
            className={cn(base, p === current ? 'relative z-10 border-fc-light-100 bg-fc-light-100 text-white' : normal)}
          >
            {p}
          </Link>
        )
      )}
      <Link href={href(current + 1)} aria-disabled={current >= total} className={cn(base, current >= total ? disabled : normal)}>»</Link>
    </nav>
  )
}
