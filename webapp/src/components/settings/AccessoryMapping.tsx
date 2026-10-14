'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { setAccessoryMapping, upsertAccessoryItem } from '@/actions/accessory-stock'

type Item = { id: string; name: string; active: boolean }
type Acc = { id: string; name: string; active: boolean; item_id: string | null; uses: number }

/** Configurações › Stock acessórios: que nomes da BD contam para cada acessório de stock */
export function AccessoryMapping({ items, accessories }: { items: Item[]; accessories: Acc[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [newName, setNewName] = useState('')
  const free = useMemo(() => accessories.filter((a) => !a.item_id), [accessories])
  const freeOpts = free.map((a) => ({ value: a.id, label: `${a.name}${a.uses ? ` (${a.uses} usados)` : ''}${a.active ? '' : ' · histórico'}` }))
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => { const r = await fn(); if (!r.ok) alert(r.error); router.refresh() })

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2>Acessórios com stock</h2>
        <p className="fc-small max-w-4xl text-fc-dark-60">
          Cada item da lista é o que aparece em <b>Stock Acessórios</b>. Ligue-lhe os nomes usados nas intervenções (um item pode ter
          vários nomes, ex.: &ldquo;CL-CAN&rdquo; e &ldquo;CL CAN&rdquo;). A correspondência inicial foi proposta automaticamente — reveja-a.
          Os acessórios gastos/retomados com esses nomes descontam/somam no armazém de saída/entrada (ou no armazém do técnico).
        </p>
      </div>
      <div className="flex gap-2">
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Novo item de stock (ex.: Garmin 1095)" className="max-w-sm" />
        <Button size="sm" disabled={busy || !newName.trim()} onClick={() => run(async () => { const r = await upsertAccessoryItem({ name: newName }); if (r.ok) setNewName(''); return r })}>
          <Plus /> Adicionar
        </Button>
      </div>
      <div className="border border-fc-dark-20">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 bg-fc-dark-80 px-4 py-2.5 text-white">
          <span>Item de stock</span><span>Nomes na BD que contam</span>
        </div>
        {items.map((it, i) => {
          const mapped = accessories.filter((a) => a.item_id === it.id)
          return (
            <div key={it.id} className={`grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 border-t border-fc-dark-10 px-4 py-2 ${i % 2 === 0 ? 'bg-fc-grey-80' : ''} ${it.active ? '' : 'opacity-50'}`}>
              <div className="space-y-1">
                <p className="font-bold">{it.name}</p>
                <button className="fc-small text-fc-light-100 underline" disabled={busy}
                  onClick={() => run(() => upsertAccessoryItem({ id: it.id, name: it.name, active: !it.active }))}>
                  {it.active ? 'Desativar' : 'Ativar'}
                </button>
              </div>
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {mapped.map((a) => (
                    <span key={a.id} className="inline-flex items-center gap-1 border border-fc-dark-20 bg-white px-2 py-0.5 fc-small">
                      {a.name}{a.uses ? <span className="text-fc-dark-60">· {a.uses}</span> : null}
                      <button title="Retirar" disabled={busy} onClick={() => run(() => setAccessoryMapping(a.id, null))}><X className="size-3" /></button>
                    </span>
                  ))}
                  {mapped.length === 0 && <span className="fc-small text-[#c7830b]">Sem nomes associados — não conta nas intervenções</span>}
                </div>
                <div className="max-w-md">
                  <SearchableSelect options={freeOpts} value="" onChange={(v) => v && run(() => setAccessoryMapping(v, it.id))} placeholder="+ ligar um nome da BD…" />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
