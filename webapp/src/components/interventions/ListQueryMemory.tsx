'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

/**
 * Filtros da lista de intervenções guardados na sessão do browser: ao voltar à lista (seta "Voltar", menu
 * "Intervenções", depois de apagar…), repõe os últimos filtros/página. "Limpar" usa ?limpar=1 e esquece-os.
 */
const KEY = 'interventions-list-query'
const read = () => { try { return sessionStorage.getItem(KEY) ?? '' } catch { return '' } }

export function ListQueryMemory() {
  const router = useRouter()
  const params = useSearchParams()
  useEffect(() => {
    const q = params.toString()
    try {
      if (params.get('limpar') === '1') { sessionStorage.removeItem(KEY); router.replace('/interventions'); return }
      if (!q) { const saved = read(); if (saved) router.replace(`/interventions?${saved}`); return }
      sessionStorage.setItem(KEY, q)
    } catch { /* sem sessionStorage: não guarda */ }
  }, [params, router])
  return null
}

/** Seta "Voltar" do detalhe: volta à lista com os filtros que estavam */
export function BackToList({ className, children }: { className?: string; children: React.ReactNode }) {
  const [href, setHref] = useState('/interventions')
  useEffect(() => { const q = read(); if (q) setHref(`/interventions?${q}`) }, [])
  return <Link href={href} className={className} aria-label="Voltar">{children}</Link>
}
