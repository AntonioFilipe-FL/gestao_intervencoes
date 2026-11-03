'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { undoAdjustBatch } from '@/actions/stock'

/** Anular um lote de ajuste (só admin / super admin) */
export function UndoAdjustBatch({ createdAt, fromId, toId, n }: { createdAt: string; fromId: string | null; toId: string | null; n: number }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy}
        className="inline-flex items-center gap-1 border border-fc-dark-20 px-2 py-1 fc-small font-semibold hover:border-fc-danger disabled:opacity-60"
        onClick={() => {
          if (!confirm(`Anular este ajuste de ${n} IMEI(s)? Os IMEIs voltam ao armazém onde estavam antes (os que entretanto tiveram outro movimento ficam como estão).`)) return
          start(async () => {
            const r = await undoAdjustBatch({ createdAt, fromId, toId })
            if (!r.ok) return setMsg({ ok: false, text: r.error })
            setMsg({ ok: true, text: `${r.n} IMEI(s) repostos.${r.skipped.length ? ` ${r.skipped.length} ignorado(s) por terem movimentos posteriores: ${r.skipped.slice(0, 5).join(', ')}${r.skipped.length > 5 ? '…' : ''}` : ''}` })
            router.refresh()
          })
        }}>
        <Undo2 className="size-3.5" /> {busy ? 'A anular…' : 'Anular ajuste'}
      </button>
      {msg && <span className={`fc-small ${msg.ok ? 'text-[#4b850d]' : 'text-[#b31d25]'}`}>{msg.text}</span>}
    </span>
  )
}
