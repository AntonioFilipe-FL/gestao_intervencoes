'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setStockMinMargin } from '@/actions/superadmin'

/** Definições só para o super admin */
export function SuperAdminSettings({ margin }: { margin: number }) {
  const [busy, start] = useTransition()
  const [v, setV] = useState(String(margin))
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h3 className="font-bold">Stock mínimo — margem do aviso amarelo</h3>
        <p className="fc-small text-fc-dark-60">
          Vermelho: stock igual ou abaixo do mínimo. Amarelo: até esta percentagem acima do mínimo (ex.: mínimo 10 e 20% → amarelo com 11 ou 12).
        </p>
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1.5"><Label>Margem (%)</Label>
          <Input type="number" min={0} max={500} value={v} onChange={(e) => setV(e.target.value)} className="w-32" /></div>
        <Button disabled={busy} onClick={() => start(async () => {
          const r = await setStockMinMargin(v)
          setMsg(r.ok ? { tone: 'ok', text: 'Guardado.' } : { tone: 'err', text: r.error })
        })}>{busy ? 'A guardar…' : 'Guardar'}</Button>
      </div>
      {msg && <p className={msg.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
    </div>
  )
}
