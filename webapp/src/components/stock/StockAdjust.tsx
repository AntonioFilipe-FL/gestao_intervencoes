'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { applyStockCount, previewStockCount, removeImeisFromStock, replaceRmaImeis } from '@/actions/stock'

type Opt = { id: string; name: string }
type Preview = Awaited<ReturnType<typeof previewStockCount>>
const today = () => new Date().toISOString().slice(0, 10)
const countImeis = (t: string) => new Set(t.split(/[\s,;]+/).filter(Boolean)).size
const MOD = [{ value: 'Venda', label: 'Venda' }, { value: 'Aluguer', label: 'Aluguer' }]
const REASONS = ['Perdido / extraviado', 'Avariado / abatido', 'Devolvido ao fornecedor', 'Erro de registo', 'Outro'].map((r) => ({ value: r, label: r }))

/** Botão "Acerto de stock": contagem de um armazém ou retirar IMEIs do stock (só admin) */
export function StockAdjust({ warehouses }: { warehouses: Opt[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'contagem' | 'retirar' | 'rma'>('contagem')
  const [f, setF] = useState({ wh: '', imeis: '', date: today(), modality: '', reason: '', notes: '' })
  const [prev, setPrev] = useState<Preview | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const set = (k: keyof typeof f) => (v: string) => { setF((x) => ({ ...x, [k]: v })); if (k === 'wh' || k === 'imeis') setPrev(null) }
  const whOpts = warehouses.map((w) => ({ value: w.id, label: w.name }))
  const n = countImeis(f.imeis)

  const openDlg = () => { setF({ wh: '', imeis: '', date: today(), modality: '', reason: '', notes: '' }); setPrev(null); setMsg(null); setOpen(true) }

  const check = () => start(async () => {
    setMsg(null)
    try { setPrev(await previewStockCount({ warehouseId: f.wh, imeis: f.imeis })) } catch (e) { setMsg({ tone: 'err', text: (e as Error).message }) }
  })
  const apply = () => start(async () => {
    const r = mode === 'contagem'
      ? await applyStockCount({ warehouseId: f.wh, imeis: f.imeis, date: f.date, modality: f.modality, notes: f.notes })
      : mode === 'rma'
        ? await replaceRmaImeis({ pairs: f.imeis, toWarehouseId: f.wh, date: f.date, notes: f.notes })
        : await removeImeisFromStock({ imeis: f.imeis, reason: f.reason, date: f.date, notes: f.notes })
    if (!r.ok) return setMsg({ tone: 'err', text: r.error })
    setMsg({ tone: 'ok', text: [`${r.n} ${mode === 'rma' ? 'substituição(ões)' : 'movimento(s) de acerto'} registados.`, ...r.warnings].join(' ') })
    setPrev(null); setF((x) => ({ ...x, imeis: '' }))
    router.refresh()
  })

  const tab = (k: typeof mode, label: string) => (
    <button type="button" onClick={() => { setMode(k); setPrev(null); setMsg(null) }}
      className={`px-3 py-1.5 fc-small font-semibold ${mode === k ? 'bg-fc-dark text-white' : 'border border-fc-dark-20'}`}>{label}</button>
  )

  return (
    <>
      <Button size="lg" variant="inverse" onClick={openDlg}><ClipboardCheck /> Acerto de stock</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle>Acerto de stock</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">{tab('contagem', 'Contagem do armazém')}{tab('retirar', 'Retirar IMEIs do stock')}{tab('rma', 'Substituição RMA')}</div>
            <p className="fc-small text-fc-dark-60">
              {mode === 'contagem'
                ? 'Cole todos os IMEIs que estão fisicamente no armazém. Os que a app tem lá e não foram contados saem do stock; os contados que não estavam lá entram (vindos do armazém onde estavam, ou como receção).'
                : mode === 'rma'
                  ? 'Uma linha por substituição: IMEI antigo e IMEI novo (ex.: 864696061230876 864696061259164). O antigo sai do stock e o novo entra com a mesma modalidade, no armazém escolhido ou, se não escolher, no mesmo onde estava o antigo (ex.: RMA).'
                  : 'Os IMEIs saem do stock do armazém onde estão, com o motivo indicado (fica no histórico como Ajuste).'}
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {mode === 'contagem' ? (
                <>
                  <div className="space-y-1.5"><Label>Armazém *</Label><SearchableSelect options={whOpts} value={f.wh} onChange={set('wh')} placeholder="Armazém contado" /></div>
                  <div className="space-y-1.5"><Label>Modalidade dos que entram</Label><SearchableSelect options={MOD} value={f.modality} onChange={set('modality')} placeholder="Mantém / sem modalidade" /></div>
                </>
              ) : mode === 'rma' ? (
                <div className="space-y-1.5"><Label>Armazém do IMEI novo</Label><SearchableSelect options={whOpts} value={f.wh} onChange={set('wh')} placeholder="O mesmo do IMEI antigo" /></div>
              ) : (
                <div className="space-y-1.5"><Label>Motivo *</Label><SearchableSelect options={REASONS} value={f.reason} onChange={set('reason')} placeholder="Escolha" /></div>
              )}
              <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>{mode === 'rma' ? 'IMEI antigo  →  IMEI novo' : `IMEIs ${mode === 'contagem' ? 'contados' : 'a retirar'}`} * {mode !== 'rma' && n > 0 && <span className="normal-case text-fc-dark-60">({n})</span>}</Label>
              <Textarea rows={6} value={f.imeis} onChange={(e) => set('imeis')(e.target.value)} placeholder={mode === 'rma' ? '864696061230876 864696061259164' : 'Um IMEI por linha (pode colar uma coluna do Excel)'} className="font-mono text-[12px]" />
            </div>
            <div className="space-y-1.5"><Label>Observações</Label><Input value={f.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Ex.: inventário de outubro" /></div>

            {prev && (
              <div className="space-y-2 border border-fc-dark-20 px-3 py-2 fc-small">
                <p><b>{prev.ok}</b> batem certo · <b className="text-[#b31d25]">{prev.missing.length}</b> faltam (saem do stock) · <b className="text-[#4b850d]">{prev.extra.length}</b> a mais (entram)</p>
                {prev.missing.length > 0 && (
                  <div><p className="font-semibold">Faltam:</p>
                    <p className="font-mono text-[12px]">{prev.missing.slice(0, 40).map((m) => `${m.imei}${m.equipment ? ` (${m.equipment})` : ''}`).join(', ')}{prev.missing.length > 40 ? '…' : ''}</p></div>
                )}
                {prev.extra.length > 0 && (
                  <div><p className="font-semibold">A mais:</p>
                    <p className="font-mono text-[12px]">{prev.extra.slice(0, 40).map((e) => `${e.imei} (${e.from ?? 'sem stock → receção'})`).join(', ')}{prev.extra.length > 40 ? '…' : ''}</p></div>
                )}
              </div>
            )}
            {msg && <p className={msg.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
          </div>
          <DialogFooter>
            <Button variant="inverse" onClick={() => setOpen(false)}>Fechar</Button>
            {mode === 'contagem' ? (
              prev
                ? <Button disabled={busy || (!prev.missing.length && !prev.extra.length)} onClick={apply}>{busy ? 'A aplicar…' : 'Aplicar acerto'}</Button>
                : <Button disabled={busy || !f.wh} onClick={check}>{busy ? 'A comparar…' : 'Comparar'}</Button>
            ) : mode === 'rma' ? (
              <Button disabled={busy || !f.imeis.trim()} onClick={apply}>{busy ? 'A registar…' : 'Registar substituição'}</Button>
            ) : (
              <Button disabled={busy || n === 0 || !f.reason} onClick={apply}>{busy ? 'A registar…' : `Retirar ${n || ''} IMEI(s)`}</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
