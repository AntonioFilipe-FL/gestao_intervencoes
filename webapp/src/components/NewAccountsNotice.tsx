'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { UserPlus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getNewIntranetAccounts, markNewAccountsSeen, resolveNewAccounts } from '@/actions/new-accounts'

type Row = { id: string; name: string; full_name: string | null; first_seen_at: string }

/** Pop-up do super admin: contas novas na Intranet → criar o cliente na BD (ou ignorar) */
export function NewAccountsNotice() {
  const [info, setInfo] = useState<{ now: string; rows: Row[] } | null>(null)
  const [sel, setSel] = useState<string[]>([])
  const [busy, start] = useTransition()
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  // espera um pouco para não abrir em cima dos outros avisos
  useEffect(() => {
    const t = setTimeout(() => getNewIntranetAccounts().then((r) => { if (r) { setInfo(r); setSel(r.rows.map((x) => x.id)) } }).catch(() => {}), 3000)
    return () => clearTimeout(t)
  }, [])
  if (!info) return null
  const close = () => { void markNewAccountsSeen(info.now); setInfo(null) }
  const act = (action: 'create' | 'ignore') => start(async () => {
    const r = await resolveNewAccounts(sel, action)
    if (!r.ok) return setMsg({ tone: 'err', text: r.error })
    setMsg({ tone: 'ok', text: r.text })
    const left = info.rows.filter((x) => !sel.includes(x.id))
    setInfo({ ...info, rows: left }); setSel([])
    if (!left.length) setTimeout(close, 1500)
  })
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle><UserPlus className="mr-2 inline size-5 align-[-4px]" />Contas novas na Intranet</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p>Há <b>{info.rows.length}</b> conta(s) nova(s) na Intranet sem cliente na aplicação.</p>
          <div className="max-h-[50vh] overflow-y-auto border border-fc-dark-20">
            {info.rows.map((r) => (
              <label key={r.id} className="flex cursor-pointer items-start gap-2 border-t border-fc-dark-10 px-3 py-1.5 first:border-t-0">
                <input type="checkbox" className="mt-1" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} />
                <span className="flex-1">
                  <b>{r.name}</b>{r.full_name && r.full_name !== r.name && <span className="text-fc-dark-60"> · {r.full_name}</span>}
                  <span className="block fc-small text-fc-dark-60">Conta {r.id} · vista em {r.first_seen_at.slice(0, 10).split('-').reverse().join('/')}</span>
                </span>
              </label>
            ))}
          </div>
          {msg && <p className={msg.tone === 'ok' ? 'bg-fc-success/20 px-3 py-2 text-[#4b850d]' : 'bg-fc-danger/20 px-3 py-2 text-[#b31d25]'}>{msg.text}</p>}
          <p className="fc-small text-fc-dark-60">Para associar a um cliente que já existe, use Configurações › Intranet.</p>
        </div>
        <DialogFooter>
          <Button variant="inverse" onClick={close}>Mais tarde</Button>
          <Link href="/settings?tab=intranet" onClick={close} className={buttonVariants({ variant: 'inverse' })}>Associar…</Link>
          <Button variant="inverse" disabled={busy || !sel.length} onClick={() => act('ignore')}>Ignorar ({sel.length})</Button>
          <Button disabled={busy || !sel.length} onClick={() => act('create')}>{busy ? 'A criar…' : `Criar ${sel.length} cliente(s)`}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
