'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { setHardwareMapping, type HardwareRow } from '@/actions/intranet'
import { matchEquipment } from '@/lib/hardware'
import { cn } from '@/lib/utils'

/**
 * Configurações › Equipamentos: correspondência entre o "hardware" da Intranet
 * (ex.: "Teltonika FMC150-EU (QJIB0)") e o equipamento da lista.
 * Por omissão é automática (nome do equipamento contido no hardware); aqui pode corrigir-se.
 */
export function HardwareMapping({ rows, equipment }: { rows: HardwareRow[]; equipment: { id: string; name: string }[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [q, setQ] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(false)
  const options = useMemo(() => equipment.map((e) => ({ value: e.id, label: e.name })), [equipment])

  const list = rows
    .map((r) => ({ ...r, auto: matchEquipment(r.hardware, equipment)?.item ?? null }))
    .filter((r) => !q || r.hardware.toLowerCase().includes(q.toLowerCase()))
    .filter((r) => !onlyMissing || (!r.equipment_id && !r.auto))
  const missing = rows.filter((r) => !r.equipment_id && !matchEquipment(r.hardware, equipment)).length

  const save = (hardware: string, equipmentId: string) =>
    start(async () => {
      const r = await setHardwareMapping(hardware, equipmentId || null)
      if (!r.ok) alert(r.error)
      router.refresh()
    })

  return (
    <div className="space-y-3 border-t border-fc-dark-20 pt-5">
      <div className="space-y-1">
        <h2>Hardware da Intranet → Equipamento</h2>
        <p className="fc-small max-w-4xl text-fc-dark-60">
          Ao escolher um IMEI (ou a matrícula) no registo, o equipamento é preenchido a partir do hardware que a Intranet indica.
          A correspondência é <b>automática</b> quando o nome do equipamento aparece no nome do hardware
          (ex.: &ldquo;Teltonika FMC150-EU (QJIB0)&rdquo; → FMC150). Escolha um equipamento para corrigir ou completar; limpe para voltar ao automático.
          Só entram equipamentos em &ldquo;Novos registos&rdquo;.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="text-fc-dark-60">Ainda não há hardware sincronizado — sincronize a Intranet (Configurações › Intranet).</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-fc-dark-40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Procurar hardware…"
                className="h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 pr-2 pl-8 text-[13px] outline-none placeholder:text-fc-dark-40 focus:border-fc-light-60"
              />
            </div>
            <Button size="sm" variant={onlyMissing ? 'secondary' : 'inverse'} onClick={() => setOnlyMissing((v) => !v)}>
              Sem correspondência ({missing})
            </Button>
          </div>

          <div className="border border-fc-dark-20">
            <div className="grid grid-cols-[minmax(0,2fr)_5rem_minmax(0,2fr)] gap-3 bg-fc-dark-80 px-4 py-2.5 text-white">
              <span>Hardware na Intranet</span>
              <span className="text-right">IMEIs</span>
              <span>Equipamento</span>
            </div>
            {list.map((r, i) => (
              <div key={r.hardware} className={cn('grid grid-cols-[minmax(0,2fr)_5rem_minmax(0,2fr)] items-center gap-3 border-t border-fc-dark-10 px-4 py-1.5', i % 2 === 0 && 'bg-fc-grey-80')}>
                <span className="truncate">{r.hardware}</span>
                <span className="text-right tabular-nums text-fc-dark-60">{r.devices.toLocaleString('pt-PT')}</span>
                <div className="min-w-0 space-y-0.5">
                  <SearchableSelect
                    options={options}
                    value={r.equipment_id ?? ''}
                    onChange={(v) => save(r.hardware, v)}
                    placeholder={r.auto ? `Automático: ${r.auto.name}` : 'Sem correspondência — escolha'}
                    invalid={!r.equipment_id && !r.auto}
                  />
                  {r.equipment_id && <p className="fc-small text-fc-dark-60">Definido à mão{r.auto && r.auto.id !== r.equipment_id ? ` (o automático seria ${r.auto.name})` : ''}</p>}
                </div>
              </div>
            ))}
            {list.length === 0 && <p className="px-4 py-6 text-center text-fc-dark-60">Nada para mostrar.</p>}
          </div>
          {busy && <p className="fc-small text-fc-dark-60">A guardar…</p>}
        </>
      )}
    </div>
  )
}
