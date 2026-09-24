'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Plus, EyeOff, RotateCcw, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { resolvePending } from '@/actions/intranet'
import type { PendingAccount } from '@/lib/intranet'
import { cn } from '@/lib/utils'

const PAGE = 25
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Contas da Intranet sem correspondência: associar a um cliente existente, criar novo ou ignorar */
export function PendingAccounts({
  pending,
  candidates,
}: {
  pending: PendingAccount[]
  candidates: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [showIgnored, setShowIgnored] = useState(false)
  const [choice, setChoice] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const options = useMemo(() => candidates.map((c) => ({ value: c.id, label: c.name })), [candidates])
  const list = useMemo(() => {
    const f = fold(q.trim())
    return pending
      .filter((p) => (showIgnored ? p.status === 'ignored' : p.status === 'pending'))
      .filter((p) => !f || fold(p.name).includes(f) || fold(p.full_name ?? '').includes(f))
  }, [pending, q, showIgnored])
  const pages = Math.max(1, Math.ceil(list.length / PAGE))
  const visible = list.slice((page - 1) * PAGE, page * PAGE)
  const pendingCount = pending.filter((p) => p.status === 'pending').length
  const ignoredCount = pending.length - pendingCount

  const run = (ids: string[], action: Parameters<typeof resolvePending>[1], okText: string) =>
    start(async () => {
      const r = await resolvePending(ids, action)
      if (!r.ok) setMsg({ tone: 'err', text: r.error })
      else setMsg({ tone: r.warning ? 'err' : 'ok', text: r.warning ?? okText })
      router.refresh()
    })

  if (pending.length === 0) return null

  return (
    <div className="border border-fc-dark-20">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-fc-dark-20 px-4 py-2.5">
        <span className="font-bold uppercase">
          Contas da Intranet por associar ({pendingCount}){ignoredCount > 0 && <span className="font-normal normal-case text-fc-dark-60"> · {ignoredCount} ignoradas</span>}
        </span>
        <div className="flex items-center gap-2">
          {ignoredCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setShowIgnored((v) => !v); setPage(1) }}>
              {showIgnored ? 'Ver por associar' : 'Ver ignoradas'}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className="fc-small text-fc-dark-60">
          Estas contas não têm correspondência automática pelo nome. Escolha o cliente da BD a que correspondem
          e carregue em <b>Associar</b> (o cliente passa a ter o nome da Intranet e fica com os IMEIs dessa conta),
          ou <b>Criar novo</b> se o cliente ainda não existe. O cliente sugerido é o de nome mais parecido.
        </p>

        {msg && (
          <p className={cn('px-3 py-2', msg.tone === 'ok' ? 'bg-fc-success/20 text-[#4b850d]' : 'bg-fc-danger/20 text-[#b31d25]')}>{msg.text}</p>
        )}

        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fc-dark-40" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1) }}
            placeholder="Pesquisar conta da Intranet…"
            className="h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 pr-2 pl-8 text-[13px] outline-none placeholder:text-fc-dark-40 focus:border-fc-light-60"
          />
        </div>

        <div className="border border-fc-dark-20">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 bg-fc-dark-80 px-4 py-2.5 text-white">
            <span>Conta na Intranet</span>
            <span>Cliente na BD</span>
            <span className="w-[270px]">Ação</span>
          </div>
          {visible.length === 0 && <p className="px-4 py-6 text-center text-fc-dark-60">Nada para mostrar.</p>}
          {visible.map((p, i) => {
            const selected = choice[p.intranet_account_id] ?? p.suggestion?.id ?? ''
            return (
              <div
                key={p.intranet_account_id}
                className={cn('grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-3 border-t border-fc-dark-10 px-4 py-2', i % 2 === 0 && 'bg-fc-grey-80')}
              >
                <div className="min-w-0">
                  <p className="truncate">{p.name}</p>
                  <p className="fc-small truncate text-fc-dark-60">
                    {p.full_name && p.full_name !== p.name ? `${p.full_name} · ` : ''}ID {p.intranet_account_id}
                  </p>
                </div>
                <div className="min-w-0 space-y-0.5">
                  {showIgnored ? (
                    <span className="text-fc-dark-40">—</span>
                  ) : (
                    <>
                      <SearchableSelect
                        options={options}
                        value={selected}
                        onChange={(v) => setChoice((c) => ({ ...c, [p.intranet_account_id]: v }))}
                        placeholder="Escolha o cliente existente"
                      />
                      {p.suggestion && selected === p.suggestion.id && (
                        <p className="fc-small text-fc-dark-60">Sugestão ({Math.round(p.suggestion.score * 100)}% parecido)</p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex w-[270px] justify-end gap-1.5">
                  {showIgnored ? (
                    <Button variant="inverse" size="sm" disabled={busy} onClick={() => run([p.intranet_account_id], { type: 'restore' }, `"${p.name}" reposta.`)}>
                      <RotateCcw /> Repor
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" disabled={busy || !selected} onClick={() => run([p.intranet_account_id], { type: 'link', clientId: selected }, `"${p.name}" associada.`)}>
                        <Link2 /> Associar
                      </Button>
                      <Button variant="inverse" size="sm" disabled={busy} onClick={() => run([p.intranet_account_id], { type: 'create' }, `Cliente "${p.name}" criado.`)}>
                        <Plus /> Criar novo
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy} aria-label="Ignorar" title="Ignorar esta conta" onClick={() => run([p.intranet_account_id], { type: 'ignore' }, `"${p.name}" ignorada.`)}>
                        <EyeOff />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="fc-small text-fc-dark-60">
            {list.length} conta(s){pages > 1 ? ` · página ${page} de ${pages}` : ''}
          </span>
          <div className="flex gap-2">
            {!showIgnored && list.length > 0 && (
              <Button
                variant="inverse"
                size="sm"
                disabled={busy}
                onClick={() => {
                  const ids = visible.filter((p) => !(choice[p.intranet_account_id] ?? p.suggestion?.id)).map((p) => p.intranet_account_id)
                  if (ids.length === 0) return setMsg({ tone: 'err', text: 'Todas as contas desta página têm um cliente escolhido — use Associar.' })
                  if (confirm(`Criar ${ids.length} cliente(s) novo(s) para as contas desta página sem cliente escolhido?`))
                    run(ids, { type: 'create' }, `${ids.length} cliente(s) criado(s).`)
                }}
              >
                <Plus /> Criar novos (página, sem escolha)
              </Button>
            )}
            <Button variant="inverse" size="sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>«</Button>
            <Button variant="inverse" size="sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>»</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
