'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PackagePlus, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { registerReception, registerTransfer } from '@/actions/stock'

type Opt = { id: string; name: string }
const today = () => new Date().toISOString().slice(0, 10)
const countImeis = (t: string) => new Set(t.split(/[\s,;]+/).filter(Boolean)).size
const MOD = [{ value: 'Venda', label: 'Venda' }, { value: 'Aluguer', label: 'Aluguer' }]

/** Botões "Receção" e "Transferência" do ecrã de stock (só admin) */
export function StockActions({ warehouses, originWarehouses, equipment }: { warehouses: Opt[]; originWarehouses?: Opt[]; equipment: Opt[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [open, setOpen] = useState<'rececao' | 'transferencia' | null>(null)
  const [f, setF] = useState({ from: '', to: '', modality: '', equipment: '', imeis: '', date: today(), notes: '' })
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const whOpts = warehouses.map((w) => ({ value: w.id, label: w.name }))
  // a origem da transferência pode ser o "Instalado Aluguer (Mobilizado)" (retornos de clientes)
  const fromOpts = (originWarehouses ?? warehouses).map((w) => ({ value: w.id, label: w.name }))
  const eqOpts = equipment.map((e) => ({ value: e.id, label: e.name }))
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))

  const openDlg = (k: 'rececao' | 'transferencia') => {
    setF({ from: '', to: '', modality: '', equipment: '', imeis: '', date: today(), notes: '' })
    setMsg(null)
    setOpen(k)
  }

  const submit = () =>
    start(async () => {
      const r =
        open === 'rececao'
          ? await registerReception({ warehouseId: f.to, modality: f.modality, equipmentId: f.equipment, imeis: f.imeis, date: f.date, notes: f.notes })
          : await registerTransfer({ fromWarehouseId: f.from, toWarehouseId: f.to, modality: f.modality, imeis: f.imeis, date: f.date, notes: f.notes })
      if (!r.ok) return setMsg({ tone: 'err', text: r.error })
      setMsg({ tone: 'ok', text: [`${r.n} IMEI(s) registados.`, ...r.warnings].join(' ') })
      setF((x) => ({ ...x, imeis: '' }))
      router.refresh()
    })

  const n = countImeis(f.imeis)

  return (
    <>
      <Button size="lg" onClick={() => openDlg('rececao')}><PackagePlus /> Receção</Button>
      <Button size="lg" variant="inverse" onClick={() => openDlg('transferencia')}><ArrowRightLeft /> Transferência</Button>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{open === 'rececao' ? 'Receção de material' : 'Transferência entre armazéns'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {open === 'rececao' ? (
              <p className="fc-small text-fc-dark-60">
                Material que chega (compra, fornecedor ou contagem de stock inicial). Os IMEIs ficam em stock no armazém escolhido.
              </p>
            ) : (
              <p className="fc-small text-fc-dark-60">Os IMEIs têm de estar no armazém de origem. Para um retorno de aluguer (ex.: Proef), escolha como origem &ldquo;Instalado Aluguer (Mobilizado)&rdquo;.</p>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {open === 'transferencia' && (
                <div className="space-y-1.5">
                  <Label>Armazém de origem *</Label>
                  <SearchableSelect options={fromOpts} value={f.from} onChange={set('from')} placeholder="Origem" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>{open === 'rececao' ? 'Armazém *' : 'Armazém de destino *'}</Label>
                <SearchableSelect options={whOpts} value={f.to} onChange={set('to')} placeholder="Destino" />
              </div>
              <div className="space-y-1.5">
                <Label>{open === 'rececao' ? 'Venda / Aluguer *' : 'Mudar para (opcional)'}</Label>
                <SearchableSelect options={MOD} value={f.modality} onChange={set('modality')} placeholder={open === 'rececao' ? 'Escolha' : 'Mantém a atual'} />
              </div>
              {open === 'rececao' && (
                <div className="space-y-1.5">
                  <Label>Equipamento</Label>
                  <SearchableSelect options={eqOpts} value={f.equipment} onChange={set('equipment')} placeholder="Automático pelo hardware da Intranet" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>IMEIs * {n > 0 && <span className="normal-case text-fc-dark-60">({n})</span>}</Label>
              <Textarea rows={6} value={f.imeis} onChange={(e) => set('imeis')(e.target.value)} placeholder="Um IMEI por linha (pode colar uma coluna do Excel)" className="font-mono text-[12px]" />
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={f.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Ex.: fatura, guia de remessa, técnico…" />
            </div>
            {msg && <p className={msg.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
          </div>
          <DialogFooter>
            <Button variant="inverse" onClick={() => setOpen(null)}>Fechar</Button>
            <Button disabled={busy || n === 0} onClick={submit}>{busy ? 'A registar…' : `Registar ${n || ''} IMEI(s)`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
