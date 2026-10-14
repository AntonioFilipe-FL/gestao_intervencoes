'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { moveToInternalUse } from '@/actions/stock'

type Row = { imei: string; plate: string | null; account: string | null; warehouse: string | null }

/** Aviso: IMEIs nas contas demopt/testing que não estão no armazém Uso Interno */
export function InternalUseNotice({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [open, setOpen] = useState(false)
  if (!rows.length) return null
  const run = (imeis?: string[]) => start(async () => {
    const r = await moveToInternalUse(imeis)
    if (!r.ok) alert(r.error)
    router.refresh()
  })
  return (
    <div className="space-y-2 border border-fc-light-60 bg-fc-light-100/5 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          <b>{rows.length} IMEI(s)</b> estão nas contas de uso interno da Intranet (demopt / testing) mas não no armazém <b>Uso Interno</b>.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="inverse" onClick={() => setOpen((v) => !v)}>{open ? 'Esconder' : 'Ver lista'}</Button>
          <Button size="sm" disabled={busy} onClick={() => confirm(`Passar ${rows.length} IMEI(s) para o Uso Interno?`) && run()}>
            {busy ? 'A passar…' : 'Passar todos para Uso Interno'}
          </Button>
        </div>
      </div>
      {open && (
        <div className="max-h-72 overflow-auto border border-fc-dark-10 bg-white">
          {rows.map((r) => (
            <div key={r.imei} className="flex items-center gap-3 border-t border-fc-dark-10 px-3 py-1 fc-small first:border-t-0">
              <span className="w-36 font-mono">{r.imei}</span>
              <span className="w-28">{r.account}</span>
              <span className="w-28">{r.plate ?? '—'}</span>
              <span className="flex-1 text-fc-dark-60">na app: {r.warehouse ?? 'fora do stock'}</span>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => run([r.imei])}>Passar</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
