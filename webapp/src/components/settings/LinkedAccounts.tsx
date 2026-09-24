'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Search, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { linkAnotherClient, unlinkIntranetClient } from '@/actions/intranet'
import type { LinkedAccount } from '@/lib/intranet'
import { cn } from '@/lib/utils'

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Contas da Intranet já ligadas: permite ligar mais do que um cliente da BD à mesma conta
 * (ex.: o cliente de venda e o de aluguer da mesma empresa) e desligar clientes.
 */
export function LinkedAccounts({
  accounts,
  candidates,
}: {
  accounts: LinkedAccount[]
  /** clientes da BD sem ligação à Intranet */
  candidates: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [account, setAccount] = useState('')
  const [client, setClient] = useState('')
  const [q, setQ] = useState('')
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const accountOptions = useMemo(
    () => accounts.map((a) => ({ value: a.intranet_account_id, label: `${a.name} (${a.clients.length} cliente${a.clients.length > 1 ? 's' : ''})` })),
    [accounts]
  )
  const clientOptions = useMemo(() => candidates.map((c) => ({ value: c.id, label: c.name })), [candidates])

  const f = fold(q.trim())
  const shown = f
    ? accounts.filter((a) => fold(a.name).includes(f) || a.clients.some((c) => fold(c.name).includes(f)))
    : accounts.filter((a) => a.clients.length > 1)

  const run = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, okText: string) =>
    start(async () => {
      const r = await fn()
      setMsg(r.ok ? { tone: 'ok', text: okText } : { tone: 'err', text: r.error })
      if (r.ok) setClient('')
      router.refresh()
    })

  if (accounts.length === 0) return null

  return (
    <div className="border border-fc-dark-20">
      <div className="border-b border-fc-dark-20 px-4 py-2.5 font-bold uppercase">
        Contas ligadas · associar mais do que um cliente
      </div>
      <div className="space-y-3 p-4">
        <p className="fc-small max-w-4xl text-fc-dark-60">
          Uma conta da Intranet pode corresponder a vários clientes da BD — por exemplo, o cliente de <b>venda</b> e o de
          <b> aluguer</b> da mesma empresa. Os clientes adicionais mantêm o seu nome e passam a ver os IMEIs e matrículas da conta.
        </p>

        {msg && (
          <p className={cn('px-3 py-2', msg.tone === 'ok' ? 'bg-fc-success/20 text-[#4b850d]' : 'bg-fc-danger/20 text-[#b31d25]')}>{msg.text}</p>
        )}

        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1">
            <p className="fc-label">Conta da Intranet</p>
            <SearchableSelect options={accountOptions} value={account} onChange={setAccount} placeholder="Escolha a conta" />
          </div>
          <div className="space-y-1">
            <p className="fc-label">Cliente da BD a associar</p>
            <SearchableSelect options={clientOptions} value={client} onChange={setClient} placeholder="Escolha o cliente (ex.: o de aluguer)" />
          </div>
          <Button
            disabled={busy || !account || !client}
            onClick={() => {
              const a = accounts.find((x) => x.intranet_account_id === account)
              const c = candidates.find((x) => x.id === client)
              run(() => linkAnotherClient(account, client), `"${c?.name}" associado à conta "${a?.name}".`)
            }}
          >
            <Link2 /> Associar
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fc-dark-40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Procurar conta ou cliente ligado…"
            className="h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 pr-2 pl-8 text-[13px] outline-none placeholder:text-fc-dark-40 focus:border-fc-light-60"
          />
        </div>

        <div className="border border-fc-dark-20">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 bg-fc-dark-80 px-4 py-2.5 text-white">
            <span>Conta na Intranet</span>
            <span>Clientes da BD</span>
          </div>
          {shown.length === 0 && (
            <p className="px-4 py-6 text-center text-fc-dark-60">
              {f ? 'Nada encontrado.' : 'Ainda não há contas com mais do que um cliente. Pesquise uma conta para ver os clientes ligados.'}
            </p>
          )}
          {shown.slice(0, 50).map((a, i) => (
            <div key={a.intranet_account_id} className={cn('grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 border-t border-fc-dark-10 px-4 py-2', i % 2 === 0 && 'bg-fc-grey-80')}>
              <div className="min-w-0">
                <p className="truncate">{a.name}</p>
                <p className="fc-small text-fc-dark-60">ID {a.intranet_account_id}</p>
              </div>
              <ul className="min-w-0 space-y-1">
                {a.clients.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">
                      {c.name}
                      {c.venda_aluguer && <span className="text-fc-dark-60"> · {c.venda_aluguer}</span>}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      title="Desligar este cliente da conta"
                      onClick={() => {
                        const last = a.clients.length === 1
                        if (!confirm(`Desligar "${c.name}" da conta "${a.name}"?${last ? '\nÉ o único cliente desta conta: a conta volta a "Por associar".' : ''}`)) return
                        run(() => unlinkIntranetClient(c.id), `"${c.name}" desligado.`)
                      }}
                    >
                      <Unlink /> Desligar
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          {shown.length > 50 && <p className="fc-small border-t border-fc-dark-10 px-4 py-2 text-fc-dark-60">A mostrar 50 de {shown.length} — refine a pesquisa.</p>}
        </div>
      </div>
    </div>
  )
}
