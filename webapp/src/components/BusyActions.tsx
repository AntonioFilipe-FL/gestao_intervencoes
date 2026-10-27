'use client'

import { useState } from 'react'

/** Botão de submissão de um formulário GET que mostra "a processar" até a página nova chegar */
export function BusySubmit({ label, busyLabel = 'A processar…' }: { label: string; busyLabel?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <>
      <button type="submit" onClick={() => setTimeout(() => setBusy(true), 0)} disabled={busy}
        className="bg-fc-dark-100 px-3 py-1.5 text-white disabled:opacity-70">{busy ? busyLabel : label}</button>
      {busy && <span className="fc-small text-fc-dark-60">A ler o histórico e a confirmar os pedidos na Intranet — pode demorar uns segundos…</span>}
    </>
  )
}

/** Ligação que mostra "a processar" (página demora a abrir) */
export function BusyLink({ href, label, busyLabel = 'A carregar…', className }: { href: string; label: string; busyLabel?: string; className?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <a href={href} onClick={() => setBusy(true)} aria-disabled={busy} className={`${className ?? ''} ${busy ? 'pointer-events-none opacity-70' : ''}`}>{busy ? busyLabel : label}</a>
      {busy && <span className="fc-small text-fc-dark-60">A ler o histórico e a confirmar os pedidos na Intranet — pode demorar uns segundos…</span>}
    </span>
  )
}
