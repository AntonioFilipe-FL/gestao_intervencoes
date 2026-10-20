'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Gauge, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { setStockMinimum } from '@/actions/stock'

type Opt = { id: string; name: string }
type Min = { equipment_id: string; equipment: string; warehouse_id: string; warehouse: string; min_qty: number }

/** Botão "Stock mínimo": define o mínimo por equipamento e armazém (só admin) */
export function StockMinimums({ warehouses, equipment, minimums }: { warehouses: Opt[]; equipment: Opt[]; minimums: Min[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ eq: '', wh: '', min: '' })
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const pick = (eq: string, wh: string) => {
    const cur = minimums.find((m) => m.equipment_id === eq && m.warehouse_id === wh)
    setF({ eq, wh, min: cur ? String(cur.min_qty) : '' })
  }
  const save = (min = f.min, eq = f.eq, wh = f.wh) => start(async () => {
    const r = await setStockMinimum({ equipmentId: eq, warehouseId: wh, min })
    if (!r.ok) return setMsg({ tone: 'err', text: r.error })
    setMsg({ tone: 'ok', text: min.trim() === '' ? 'Mínimo removido.' : 'Mínimo guardado.' })
    router.refresh()
  })
  return (
    <>
      <Button size="lg" variant="inverse" onClick={() => { setMsg(null); setF({ eq: '', wh: '', min: '' }); setOpen(true) }}><Gauge /> Stock mínimo</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Stock mínimo por equipamento e armazém</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <p className="fc-small text-fc-dark-60">
              Na tabela &ldquo;Por equipamento e armazém&rdquo;: <span className="text-[#b31d25]">●</span> igual ou abaixo do mínimo ·{' '}
              <span className="text-[#c98a00]">●</span> até 20% acima do mínimo. Deixe vazio para remover.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_120px]">
              <div className="space-y-1.5"><Label>Equipamento *</Label>
                <SearchableSelect options={equipment.map((e) => ({ value: e.id, label: e.name }))} value={f.eq} onChange={(v) => pick(v, f.wh)} placeholder="Equipamento" /></div>
              <div className="space-y-1.5"><Label>Armazém *</Label>
                <SearchableSelect options={warehouses.map((w) => ({ value: w.id, label: w.name }))} value={f.wh} onChange={(v) => pick(f.eq, v)} placeholder="Armazém" /></div>
              <div className="space-y-1.5"><Label>Mínimo</Label>
                <Input type="number" min={0} value={f.min} onChange={(e) => setF((x) => ({ ...x, min: e.target.value }))} placeholder="ex.: 10" /></div>
            </div>
            {msg && <p className={msg.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
            {minimums.length > 0 && (
              <div className="max-h-64 overflow-y-auto border border-fc-dark-20">
                <table className="w-full fc-small">
                  <thead><tr className="bg-fc-grey-80 text-left"><th className="px-2 py-1">Equipamento</th><th className="px-2 py-1">Armazém</th><th className="px-2 py-1 text-right">Mínimo</th><th /></tr></thead>
                  <tbody>
                    {minimums.map((m) => (
                      <tr key={m.equipment_id + m.warehouse_id} className="border-t border-fc-dark-10 hover:bg-fc-dark-10 cursor-pointer" onClick={() => pick(m.equipment_id, m.warehouse_id)}>
                        <td className="px-2 py-1">{m.equipment}</td><td className="px-2 py-1">{m.warehouse}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{m.min_qty}</td>
                        <td className="px-2 py-1 text-right">
                          <button type="button" title="Remover" disabled={busy} onClick={(e) => { e.stopPropagation(); save('', m.equipment_id, m.warehouse_id) }}
                            className="text-fc-dark-60 hover:text-[#b31d25]"><Trash2 className="size-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="inverse" onClick={() => setOpen(false)}>Fechar</Button>
            <Button disabled={busy || !f.eq || !f.wh} onClick={() => save()}>{busy ? 'A guardar…' : 'Guardar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
