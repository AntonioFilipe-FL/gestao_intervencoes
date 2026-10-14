'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PackagePlus, ArrowRightLeft, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { registerAccessoryMovement } from '@/actions/accessory-stock'

type Opt = { id: string; name: string }
type Kind = 'rececao' | 'transferencia' | 'contagem'
const TITLE: Record<Kind, string> = { rececao: 'Receção de acessórios', transferencia: 'Transferência de acessórios', contagem: 'Contagem (acerto de stock)' }
const today = () => new Date().toISOString().slice(0, 10)

/** Receção / Transferência / Contagem de acessórios (admin) */
export function AccessoryActions({ items, warehouses }: { items: Opt[]; warehouses: Opt[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [open, setOpen] = useState<Kind | null>(null)
  const [f, setF] = useState({ item: '', wh: '', to: '', qty: '', date: today(), notes: '' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))
  const itemOpts = items.map((i) => ({ value: i.id, label: i.name }))
  const whOpts = warehouses.map((w) => ({ value: w.id, label: w.name }))
  const openDlg = (k: Kind) => { setOpen(k); setMsg(null); setF({ item: '', wh: '', to: '', qty: '', date: today(), notes: '' }) }
  const submit = () => start(async () => {
    const r = await registerAccessoryMovement({ kind: open!, itemId: f.item, warehouseId: f.wh, toWarehouseId: f.to, quantity: Number(f.qty), date: f.date, notes: f.notes })
    if (!r.ok) return setMsg({ ok: false, text: r.error })
    setMsg({ ok: true, text: 'Registado.' }); setF((x) => ({ ...x, item: '', qty: '' })); router.refresh()
  })
  return (
    <>
      <Button size="lg" onClick={() => openDlg('rececao')}><PackagePlus /> Receção</Button>
      <Button size="lg" variant="inverse" onClick={() => openDlg('transferencia')}><ArrowRightLeft /> Transferência</Button>
      <Button size="lg" variant="inverse" onClick={() => openDlg('contagem')}><ClipboardCheck /> Contagem</Button>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{open ? TITLE[open] : ''}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            {open === 'contagem' && (
              <p className="fc-small text-fc-dark-60">Indique a quantidade que existe <b>fisicamente</b> no armazém. A partir desta data, o stock parte deste valor.</p>
            )}
            <div className="space-y-1.5"><Label>Acessório *</Label><SearchableSelect options={itemOpts} value={f.item} onChange={set('item')} placeholder="Escolha" /></div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5"><Label>{open === 'transferencia' ? 'Armazém de origem *' : 'Armazém *'}</Label><SearchableSelect options={whOpts} value={f.wh} onChange={set('wh')} placeholder="Escolha" /></div>
              {open === 'transferencia' && <div className="space-y-1.5"><Label>Armazém de destino *</Label><SearchableSelect options={whOpts} value={f.to} onChange={set('to')} placeholder="Escolha" /></div>}
              <div className="space-y-1.5"><Label>{open === 'contagem' ? 'Quantidade contada *' : 'Quantidade *'}</Label><Input type="number" min={0} value={f.qty} onChange={(e) => set('qty')(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Input value={f.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Ex.: guia, fornecedor…" /></div>
            {msg && <p className={msg.ok ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
          </div>
          <DialogFooter>
            <Button variant="inverse" onClick={() => setOpen(null)}>Fechar</Button>
            <Button disabled={busy || !f.item || !f.wh || f.qty === ''} onClick={submit}>{busy ? 'A registar…' : 'Registar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
