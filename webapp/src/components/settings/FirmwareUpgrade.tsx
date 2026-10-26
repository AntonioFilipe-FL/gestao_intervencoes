'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { applyFirmware, previewFirmware, type FirmwareKind, type FirmwareRow } from '@/actions/firmware'
import { getIntranetAccounts } from '@/actions/intranet-write'
import { SearchableSelect } from '@/components/ui/searchable-select'

type Opt = { id: string; name: string }

/** Super admin: pedir atualização de firmware (FMC640, FMC650, FMC130, FMC150, C4MAX V8) */
export function FirmwareUpgrade() {
  const [busy, start] = useTransition()
  const [accs, setAccs] = useState<string[]>([])
  const [accounts, setAccounts] = useState<Opt[]>([])
  useEffect(() => { getIntranetAccounts().then(setAccounts).catch(() => {}) }, [])
  const [imeis, setImeis] = useState('')
  const [rows, setRows] = useState<FirmwareRow[] | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [kind, setKind] = useState<FirmwareKind>('device')

  const preview = () => start(async () => {
    setMsg(null)
    const r = await previewFirmware({ accountIds: accs, imeis, kind })
    setRows(r)
    const typed = new Set(imeis.split(/[\s,;]+/).map((x) => x.trim()))
    setSel(r.filter((x) => !x.issue && typed.has(x.imei)).map((x) => x.imei))
  })
  const eligible = (rows ?? []).filter((r) => !r.issue)
  const todo = eligible.filter((r) => sel.includes(r.imei))
  const toggle = (imei: string) => setSel((x) => (x.includes(imei) ? x.filter((i) => i !== imei) : [...x, imei]))
  const apply = (testOne: boolean) => {
    const list = testOne ? [todo[0].imei] : todo.map((t) => t.imei)
    if (!confirm(`Vai PEDIR A ATUALIZAÇÃO ${kind === 'canadapter' ? 'DO CAN CHIP' : 'DE FIRMWARE'} de ${testOne ? `o IMEI ${list[0]}` : `${list.length} equipamento(s)`} na Intranet. Continuar?`)) return
    start(async () => {
      const r = await applyFirmware({ imeis: list, kind })
      if (!r.ok) return setMsg({ tone: 'err', text: r.error })
      setMsg({ tone: r.failed.length ? 'err' : 'ok', text: `${r.done} pedido(s) de atualização registado(s) na Intranet.${r.failed.length ? ` Falharam ${r.failed.length}: ${r.failed.slice(0, 5).map((f) => `${f.imei} (${f.error})`).join('; ')}` : ''}` })
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold">Atualização de firmware</h3>
        <div className="my-2 flex gap-2">
          {([['device', 'Firmware do equipamento'], ['canadapter', 'CAN chip (FMC150)']] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setKind(k); setRows(null); setSel([]); setMsg(null) }}
              className={`px-3 py-1.5 fc-small font-semibold ${kind === k ? 'bg-fc-dark-100 text-white' : 'border border-fc-dark-20'}`}>{l}</button>
          ))}
        </div>
        <p className="fc-small text-fc-dark-60">
          {kind === 'device' ? 'FMC640, FMC650, FMC130, FMC150 e C4MAX V8.' : 'Só FMC150 (CAN adapter / CAN chip).'} Usa a atualização disponível indicada pela Intranet para cada equipamento.
          A pré-visualização só lê; nada é pedido sem carregar em &ldquo;Atualizar&rdquo;.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Contas Intranet</Label>
          <SearchableSelect options={accounts.filter((a) => !accs.includes(a.id)).map((a) => ({ value: a.id, label: a.name }))} value=""
            onChange={(v) => v && setAccs((x) => [...x, v])} placeholder="Adicionar conta…" />
          <div className="flex flex-wrap gap-1.5">
            {accs.map((id) => (
              <button key={id} type="button" onClick={() => setAccs((x) => x.filter((i) => i !== id))} title="Retirar"
                className="border border-fc-dark-20 bg-fc-grey-80 px-2 py-0.5 fc-small hover:border-fc-danger">
                {accounts.find((a) => a.id === id)?.name ?? id} ✕
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>e/ou IMEIs</Label>
          <Textarea rows={4} value={imeis} onChange={(e) => setImeis(e.target.value)} placeholder="Um por linha" className="font-mono text-[12px]" />
        </div>
      </div>
      <Button disabled={busy || (!accs.length && !imeis.trim())} onClick={preview}>{busy && !rows ? 'A ler a Intranet…' : 'Pré-visualizar'}</Button>

      {rows && (
        <>
          <p className="fc-small">
            <b>{todo.length}</b> selecionado(s) de {eligible.length} com atualização disponível ·
            <button type="button" className="mx-1 text-fc-light-100 underline" onClick={() => setSel(eligible.map((r) => r.imei))}>selecionar todos</button>
            <button type="button" className="text-fc-light-100 underline" onClick={() => setSel([])}>nenhum</button>
          </p>
          <div className="max-h-96 overflow-auto border border-fc-dark-20">
            <table className="w-full fc-small">
              <thead className="sticky top-0 bg-fc-grey-80 text-left">
                <tr><th className="px-2 py-1" /><th className="px-2 py-1">IMEI</th><th className="px-2 py-1">Conta / armazém</th><th className="px-2 py-1">Equipamento</th><th className="px-2 py-1">{kind === 'canadapter' ? 'CAN chip atual' : 'Firmware atual'}</th><th className="px-2 py-1">Disponível</th><th className="px-2 py-1">Último pedido</th><th className="px-2 py-1">Estado</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.imei} className="border-t border-fc-dark-10">
                    <td className="px-2 py-1"><input type="checkbox" disabled={!!r.issue} checked={sel.includes(r.imei)} onChange={() => toggle(r.imei)} /></td>
                    <td className="px-2 py-1 font-mono">{r.imei}</td><td className="px-2 py-1">{r.account ?? '—'}{r.warehouse && <span className="block text-fc-dark-60">{r.warehouse}</span>}</td><td className="px-2 py-1">{r.equipment ?? '—'}</td>
                    <td className="px-2 py-1 font-mono">{r.firmware ?? '—'}</td><td className="px-2 py-1 font-mono font-bold">{r.available ?? '—'}</td>
                    <td className="px-2 py-1">{r.lastStatus ? <>{r.lastStatus}{r.lastDate && <span className="block text-fc-dark-60">{r.lastDate.slice(0, 10).split('-').reverse().join('/')}</span>}</> : '—'}</td>
                    <td className={`px-2 py-1 ${r.issue ? 'text-fc-dark-60' : ''}`}>{r.issue ?? 'Atualizar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="inverse" disabled={busy || !todo.length} onClick={() => apply(true)}>{todo[0] ? `Testar com ${todo[0].imei}` : 'Testar com 1'}</Button>
            <Button disabled={busy || !todo.length} onClick={() => apply(false)}>{busy ? 'A pedir…' : `Atualizar ${todo.length} selecionado(s)`}</Button>
          </div>
        </>
      )}
      {msg && <p className={msg.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
    </div>
  )
}
