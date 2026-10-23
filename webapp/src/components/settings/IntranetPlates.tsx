'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { applyIntranetPlates, getIntranetAccounts, previewIntranetPlates, type PlateRow } from '@/actions/intranet-write'

type Opt = { id: string; name: string }

/** Super admin: atualizar a matrícula (XX_Ay_ZZZ_12345) e, opcionalmente, a conta dos equipamentos na Intranet */
export function IntranetPlates({ warehouses }: { warehouses: Opt[] }) {
  const [busy, start] = useTransition()
  const [whs, setWhs] = useState<string[]>([])
  const [imeis, setImeis] = useState('')
  const [rows, setRows] = useState<PlateRow[] | null>(null)
  const [accounts, setAccounts] = useState<Opt[] | null>(null)
  const [account, setAccount] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [sel, setSel] = useState<string[]>([])

  const preview = () => start(async () => {
    setMsg(null)
    const r = await previewIntranetPlates({ warehouseIds: whs, imeis })
    setRows(r)
    // pré-seleciona só os IMEIs colados à mão (os dos armazéns ficam por marcar)
    const typed = new Set(imeis.split(/[\s,;]+/).map((x) => (x.trim().length === 14 ? '0' + x.trim() : x.trim())))
    setSel(r.filter((x) => typed.has(x.imei) && x.target && (!x.issue || x.issue === 'Já está certo')).map((x) => x.imei))
    if (!accounts) setAccounts(await getIntranetAccounts())
  })
  // podem ser escolhidos: os que têm matrícula calculada (incluindo os que já estão certos — para mudar só a conta)
  const eligible = (rows ?? []).filter((r) => r.target && (!r.issue || r.issue === 'Já está certo'))
  // só os IMEIs que o utilizador marcou
  const todo = eligible.filter((r) => sel.includes(r.imei))
  const toggleSel = (imei: string) => setSel((x) => (x.includes(imei) ? x.filter((i) => i !== imei) : [...x, imei]))
  const apply = (testOne: boolean) => {
    const n = testOne ? 1 : todo.length
    const first = todo[0]?.imei
    const accName = accounts?.find((a) => a.id === account)?.name
    if (!confirm(`Vai ALTERAR NA INTRANET ${testOne ? `o IMEI ${first}` : `${n} equipamento(s)`}${accName ? ` e passá-los para a conta "${accName}"` : ''}. Continuar?`)) return
    start(async () => {
      const r = await applyIntranetPlates({ imeis: testOne ? [first!] : todo.map((t) => t.imei), accountId: account || undefined })
      if (!r.ok) return setMsg({ tone: 'err', text: r.error })
      setMsg({ tone: r.failed.length ? 'err' : 'ok', text: `${r.done} atualizado(s) na Intranet.${r.failed.length ? ` Falharam ${r.failed.length}: ${r.failed.slice(0, 5).map((f) => `${f.imei} (${f.error})`).join('; ')}` : ''}` })
      setRows(await previewIntranetPlates({ warehouseIds: whs, imeis }))
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-bold">Matrículas na Intranet</h3>
        <p className="fc-small text-fc-dark-60">
          Matrícula nova: <b>XX_Ay_ZZZ_12345</b> — XX = armazém (A1/A2 → FL), y = 1 Venda / 2 Aluguer, ZZZ = operador do cartão (NOS/VDF, confirmado na Intranet ao enviar; ??? = ainda por confirmar), últimos 5 dígitos do IMEI.
          Nada é alterado na Intranet sem carregar em &ldquo;Atualizar&rdquo;.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Armazéns</Label>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {warehouses.map((w) => (
              <label key={w.id} className="flex items-center gap-1.5 fc-small">
                <input type="checkbox" checked={whs.includes(w.id)} onChange={() => setWhs((x) => (x.includes(w.id) ? x.filter((i) => i !== w.id) : [...x, w.id]))} />
                {w.name}
              </label>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>e/ou IMEIs</Label>
          <Textarea rows={4} value={imeis} onChange={(e) => setImeis(e.target.value)} placeholder="Um por linha" className="font-mono text-[12px]" />
        </div>
      </div>
      <Button disabled={busy || (!whs.length && !imeis.trim())} onClick={preview}>{busy && !rows ? 'A carregar…' : 'Pré-visualizar'}</Button>

      {rows && (
        <>
          <p className="fc-small">
            <b>{todo.length}</b> selecionado(s) de {eligible.length} possíveis ·
            <button type="button" className="mx-1 text-fc-light-100 underline" onClick={() => setSel(eligible.map((r) => r.imei))}>selecionar todos</button>
            <button type="button" className="mr-1 text-fc-light-100 underline" onClick={() => setSel([])}>nenhum</button> · {rows.filter((r) => r.issue === 'Já está certo').length} já certos · {rows.filter((r) => r.issue && r.issue !== 'Já está certo').length} com problema
          </p>
          <div className="max-h-96 overflow-auto border border-fc-dark-20">
            <table className="w-full fc-small">
              <thead className="sticky top-0 bg-fc-grey-80 text-left">
                <tr><th className="px-2 py-1" /><th className="px-2 py-1">IMEI</th><th className="px-2 py-1">Armazém</th><th className="px-2 py-1">Modalidade</th><th className="px-2 py-1">Matrícula atual</th><th className="px-2 py-1">Matrícula nova</th><th className="px-2 py-1">Conta</th><th className="px-2 py-1">Estado</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.imei} className="border-t border-fc-dark-10">
                    <td className="px-2 py-1">
                      <input type="checkbox" disabled={!eligible.includes(r)} checked={sel.includes(r.imei)} onChange={() => toggleSel(r.imei)} />
                    </td>
                    <td className="px-2 py-1 font-mono">{r.imei}</td><td className="px-2 py-1">{r.warehouse ?? '—'}</td><td className="px-2 py-1">{r.modality ?? '—'}</td>
                    <td className="px-2 py-1 font-mono">{r.current ?? '—'}</td><td className="px-2 py-1 font-mono font-bold">{r.target ?? '—'}</td>
                    <td className="px-2 py-1">{r.account ?? '—'}</td>
                    <td className={`px-2 py-1 ${r.issue && r.issue !== 'Já está certo' ? 'text-[#b31d25]' : 'text-fc-dark-60'}`}>{r.issue === 'Já está certo' ? (account ? 'Matrícula certa · muda a conta' : 'Matrícula certa') : r.issue ?? 'A atualizar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-80 space-y-1.5">
              <Label>Transferir para a conta Intranet (opcional)</Label>
              <SearchableSelect options={(accounts ?? []).map((a) => ({ value: a.id, label: a.name }))} value={account} onChange={setAccount} placeholder="Manter a conta atual" />
            </div>
            <Button variant="inverse" disabled={busy || !todo.length} onClick={() => apply(true)}>{todo[0] ? `Testar com ${todo[0].imei}` : 'Testar com 1'}</Button>
            <Button disabled={busy || !todo.length} onClick={() => apply(false)}>{busy ? 'A atualizar…' : `Atualizar ${todo.length} selecionado(s) na Intranet`}</Button>
          </div>
        </>
      )}
      {msg && <p className={msg.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
    </div>
  )
}
