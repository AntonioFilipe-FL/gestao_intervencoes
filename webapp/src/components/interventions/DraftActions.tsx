'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { dismissDraft, importDraftsNow } from '@/actions/drafts'

/** Botão "Importar agora" da página de intervenções por confirmar */
export function ImportDraftsButton() {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      {msg && <span className={`fc-small ${msg.ok ? 'text-[#4b850d]' : 'text-[#b31d25]'}`}>{msg.text}</span>}
      <Button variant="inverse" disabled={busy} onClick={() => start(async () => {
        const r = await importDraftsNow()
        setMsg(r.ok
          ? { ok: !r.errors.length, text: `${r.found} formulário(s) por validar no Creator · ${r.created} novo(s) importado(s)${r.already ? ` · ${r.already} já registado(s) retirado(s)` : ''}${r.gone ? ` · ${r.gone} retirado(s) por já não estarem “Por validar” no Creator` : ''}${r.errors.length ? ` · ${r.errors.length} com erro (${r.errors[0]})` : ''}` }
          : { ok: false, text: r.error })
        router.refresh()
      })}>{busy ? 'A importar do Creator…' : 'Importar agora'}</Button>
    </span>
  )
}

/** Dispensar um formulário importado (não é para registar) */
export function DismissDraft({ id }: { id: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  return (
    <button type="button" disabled={busy} className="fc-small text-fc-dark-60 hover:text-fc-danger disabled:opacity-60"
      onClick={() => {
        if (!confirm('Dispensar este formulário? Deixa de aparecer na lista e não é registado como intervenção.')) return
        start(async () => { const r = await dismissDraft(id); if (!r.ok) alert(r.error); router.refresh() })
      }}>{busy ? 'A dispensar…' : 'Dispensar'}</button>
  )
}
