'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { syncModalityFromCrm, setClientModality } from '@/actions/crm'
import type { CrmModalityResult } from '@/lib/zoho'

/** Botão "Atualizar do CRM" (Regime Contratual → Venda/Aluguer dos clientes) */
export function CrmModality({ configured }: { configured: boolean }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [res, setRes] = useState<CrmModalityResult | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [applied, setApplied] = useState<Set<string>>(new Set())

  const run = () => start(async () => {
    setErr(null)
    const r = await syncModalityFromCrm()
    if (!r.ok) return setErr(r.error)
    setRes(r.result); setApplied(new Set()); router.refresh()
  })
  const apply = (id: string, mod: string) => start(async () => {
    const r = await setClientModality(id, mod as 'Venda' | 'Aluguer')
    if (!r.ok) return setErr(r.error)
    setApplied((s) => new Set(s).add(id)); router.refresh()
  })

  return (
    <div className="mb-4 space-y-2 border border-fc-dark-20 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 fc-small text-fc-dark-60">
          Venda/Aluguer a partir do <b>Regime Contratual</b> do Zoho CRM (ligação pelo campo &ldquo;Nome Intranet&rdquo;).
          Preenche só os clientes ligados à Intranet que estão vazios; as diferenças são mostradas para decidir.
          Os clientes criados a partir da Intranet já são preenchidos automaticamente.
        </p>
        <Button size="sm" disabled={busy || !configured} onClick={run} title={configured ? undefined : 'Faltam as variáveis ZOHO_* no Railway'}>
          <RefreshCw /> {busy ? 'A consultar…' : 'Atualizar do CRM'}
        </Button>
      </div>
      {err && <p className="bg-fc-danger/20 px-3 py-2 text-[#b31d25]">{err}</p>}
      {res && (
        <div className="space-y-2 fc-small">
          <p>
            Verificados {res.checked} · <b>preenchidos {res.filled}</b> · sem conta no CRM {res.notFound.length} ·
            com Venda e Aluguer no CRM {res.both.length} · diferentes {res.differs.length}
          </p>
          {res.both.length > 0 && <p className="text-fc-dark-60">Venda e Aluguer no CRM (decidir à mão): {res.both.join(', ')}</p>}
          {res.notFound.length > 0 && <details><summary className="cursor-pointer text-fc-dark-60">Sem conta no CRM ({res.notFound.length})</summary><p className="text-fc-dark-60">{res.notFound.join(', ')}</p></details>}
          {res.differs.length > 0 && (
            <div className="border border-fc-dark-10">
              {res.differs.map((d) => (
                <div key={d.id} className="flex items-center gap-3 border-t border-fc-dark-10 px-3 py-1 first:border-t-0">
                  <span className="flex-1">{d.name}: app <b>{d.app}</b> · CRM <b>{d.crm}</b></span>
                  {applied.has(d.id) ? <span className="text-[#4b850d]">✓ aplicado</span> :
                    <Button size="sm" variant="inverse" disabled={busy} onClick={() => apply(d.id, d.crm)}>Usar CRM ({d.crm})</Button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
