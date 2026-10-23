'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PackagePlus, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { locateImeis, registerReception, registerTransfer } from '@/actions/stock'
import { applyIntranetForTransfer, getIntranetAccounts } from '@/actions/intranet-write'

type Opt = { id: string; name: string }
const today = () => new Date().toISOString().slice(0, 10)
const countImeis = (t: string) => new Set(t.split(/[\s,;]+/).filter(Boolean)).size
const AUTO = '__auto__'
type Loc = Awaited<ReturnType<typeof locateImeis>>
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
  const fromOpts = [{ value: AUTO, label: 'Automático (onde estão os IMEIs)' }, ...(originWarehouses ?? warehouses).map((w) => ({ value: w.id, label: w.name }))]
  const [loc, setLoc] = useState<Loc | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [shown, setShown] = useState<string | null>(null)
  // opção: atualizar a matrícula na Intranet (XX_Ay_…) e, opcionalmente, a conta
  const [intra, setIntra] = useState(false)
  const [intraAcc, setIntraAcc] = useState('')
  const [accounts, setAccounts] = useState<{ id: string; name: string }[] | null>(null)
  useEffect(() => {
    if (intra && accounts === null) getIntranetAccounts(true).then(setAccounts).catch(() => setAccounts([]))
  }, [intra, accounts])
  const eqOpts = equipment.map((e) => ({ value: e.id, label: e.name }))
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }))

  const openDlg = (k: 'rececao' | 'transferencia') => {
    setF({ from: k === 'transferencia' ? AUTO : '', to: '', modality: '', equipment: '', imeis: '', date: today(), notes: '' })
    setMsg(null)
    setLoc(null)
    setIntra(false)
    setIntraAcc('')
    setOpen(k)
  }

  // origem automática: descobre onde estão os IMEIs colados
  const isAuto = open === 'transferencia' && f.from === AUTO
  useEffect(() => {
    if (!isAuto || !f.imeis.trim()) { setLoc(null); return }
    let alive = true
    const t = setTimeout(async () => {
      const r = await locateImeis(f.imeis)
      if (!alive) return
      setLoc(r)
      setPicked(r.origins.filter((o) => o.id !== f.to).map((o) => o.id))
    }, 400)
    return () => { alive = false; clearTimeout(t) }
  }, [isAuto, f.imeis, f.to])
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const submit = () =>
    start(async () => {
      const r =
        open === 'rececao'
          ? await registerReception({ warehouseId: f.to, modality: f.modality, equipmentId: f.equipment, imeis: f.imeis, date: f.date, notes: f.notes })
          : await registerTransfer({ fromWarehouseId: isAuto ? undefined : f.from, fromWarehouseIds: isAuto ? picked : undefined, toWarehouseId: f.to, modality: f.modality, imeis: f.imeis, date: f.date, notes: f.notes })
      if (!r.ok) return setMsg({ tone: 'err', text: r.error })
      const texts = [`${r.n} IMEI(s) registados.`, ...r.warnings]
      let tone: 'ok' | 'err' = 'ok'
      if (open === 'transferencia' && intra) {
        const list = [...new Set(f.imeis.split(/[\s,;]+/).filter(Boolean))]
        const ir = await applyIntranetForTransfer({ imeis: list, accountId: intraAcc || undefined })
        if (!ir.ok) { texts.push(`Intranet: ${ir.error}`); tone = 'err' }
        else {
          texts.push(`Intranet: ${ir.done} atualizado(s).`)
          if (ir.failed.length) { tone = 'err'; texts.push(`Não atualizados ${ir.failed.length}: ${ir.failed.slice(0, 5).map((x) => `${x.imei} (${x.error})`).join('; ')}`) }
        }
      }
      setMsg({ tone, text: texts.join(' ') })
      setF((x) => ({ ...x, imeis: '' }))
      setLoc(null)
      router.refresh()
    })

  const n = isAuto && loc ? loc.origins.filter((o) => picked.includes(o.id) && o.id !== f.to).reduce((a, o) => a + o.n, 0) : countImeis(f.imeis)

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
              <p className="fc-small text-fc-dark-60">Com origem &ldquo;Automático&rdquo;, a app vê em que armazém está cada IMEI e pode escolher um ou vários armazéns de origem; o destino é sempre um. Para um retorno de aluguer (ex.: Proef), escolha como origem &ldquo;Instalado Aluguer (Mobilizado)&rdquo;.</p>
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
            {isAuto && loc && (
              <div className="space-y-1 border border-fc-dark-20 px-3 py-2">
                <p className="fc-small font-semibold">Onde estão os {loc.total} IMEI(s):</p>
                {loc.origins.map((o) => (
                  <div key={o.id}>
                    <div className="flex items-center gap-2 fc-small">
                      <input type="checkbox" disabled={o.id === f.to} checked={picked.includes(o.id) && o.id !== f.to} onChange={() => toggle(o.id)} />
                      <span>{o.name}</span><span className="text-fc-dark-60">— {o.n}{o.id === f.to ? ' (já no destino)' : ''}</span>
                      <button type="button" className="ml-auto text-fc-light-100 hover:text-fc-light-60" onClick={() => setShown((s) => (s === o.id ? null : o.id))}>
                        {shown === o.id ? 'esconder IMEIs' : 'ver IMEIs'}
                      </button>
                    </div>
                    {shown === o.id && (
                      <div className="mt-1 mb-2 ml-6">
                        <p className="max-h-32 overflow-y-auto border border-fc-dark-10 bg-fc-grey-80 px-2 py-1 font-mono text-[11px] leading-5">{o.imeis.join('  ·  ')}</p>
                        <button type="button" className="fc-small text-fc-light-100 hover:text-fc-light-60" onClick={() => void navigator.clipboard?.writeText(o.imeis.join('\n'))}>
                          copiar ({o.imeis.length})
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {loc.missing.length > 0 && (
                  <p className="fc-small text-[#b31d25]">Sem stock / não encontrados ({loc.missing.length}): {loc.missing.slice(0, 10).join(', ')}{loc.missing.length > 10 ? '…' : ''}</p>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={f.notes} onChange={(e) => set('notes')(e.target.value)} placeholder="Ex.: fatura, guia de remessa, técnico…" />
            </div>
            {open === 'transferencia' && (
              <div className="space-y-2 border border-fc-dark-20 px-3 py-2">
                <label className="flex items-center gap-2 fc-small font-semibold">
                  <input type="checkbox" checked={intra} onChange={(e) => setIntra(e.target.checked)} />
                  Atualizar a matrícula na Intranet (XX_Ay_ZZZ_12345 do armazém de destino)
                </label>
                {intra && (
                  <div className="space-y-1.5">
                    <Label>Transferir para a conta Intranet (opcional)</Label>
                    <SearchableSelect options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))} value={intraAcc} onChange={setIntraAcc} placeholder="Manter a conta atual" />
                    <p className="fc-small text-fc-dark-60">É feito logo a seguir a registar a transferência. A1/A2 → FL; y = 1 Venda / 2 Aluguer; ZZZ = NOS/VDF conforme o operador do cartão na Intranet. Os dados do equipamento (PIN, MSISDN, operador) não mudam.</p>
                  </div>
                )}
              </div>
            )}
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
