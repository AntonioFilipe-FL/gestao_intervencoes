'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { removeInstalledFromStock } from '@/actions/stock'
import { cn } from '@/lib/utils'

/**
 * "Dar saída" aos IMEIs que a Intranet mostra instalados (um IMEI, ou todos os assinalados do armazém).
 * Destino: instalado na viatura (sai do stock) ou transferir para outro armazém.
 */
export function RemoveInstalled({
  imei,
  warehouseId,
  count,
  warehouses,
}: {
  imei?: string
  warehouseId?: string
  count?: number
  warehouses: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'installed' | 'transfer'>('installed')
  const [to, setTo] = useState('')
  const [err, setErr] = useState('')

  const submit = () =>
    start(async () => {
      if (mode === 'transfer' && !to) return setErr('Escolha o armazém de destino.')
      const r = await removeInstalledFromStock({ warehouseId, imeis: imei ? [imei] : undefined, toWarehouseId: mode === 'transfer' ? to : undefined })
      if (!r.ok) return setErr(r.error)
      setOpen(false)
      router.refresh()
    })

  const Opt = ({ v, title, desc }: { v: 'installed' | 'transfer'; title: string; desc: string }) => (
    <label className={cn('flex cursor-pointer gap-2 border px-3 py-2', mode === v ? 'border-fc-light-60 bg-fc-grey-80' : 'border-fc-dark-20')}>
      <input type="radio" name="dest" checked={mode === v} onChange={() => { setMode(v); setErr('') }} className="mt-0.5" />
      <span>
        <span className="block font-bold">{title}</span>
        <span className="fc-small text-fc-dark-60">{desc}</span>
      </span>
    </label>
  )

  return (
    <>
      <Button
        variant={imei ? 'ghost' : 'secondary'}
        size="sm"
        onClick={() => { setMode('installed'); setTo(''); setErr(''); setOpen(true) }}
      >
        <LogOut /> {imei ? 'Dar saída' : `Dar saída a todos (${count ?? 0})`}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{imei ? `Dar saída ao IMEI ${imei}` : `Dar saída a ${count} IMEI(s)${warehouseId ? ' deste armazém' : ''}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Opt v="installed" title="Instalado na viatura" desc="Sai do stock (a Intranet mostra-o instalado numa viatura)." />
            <Opt v="transfer" title="Transferir para o armazém…" desc="Passa para outro armazém (ex.: está com outro técnico)." />
            {mode === 'transfer' && (
              <SearchableSelect
                options={warehouses.filter((w) => w.id !== warehouseId).map((w) => ({ value: w.id, label: w.name }))}
                value={to}
                onChange={(v) => { setTo(v); setErr('') }}
                placeholder="Escolha o armazém de destino"
              />
            )}
            {err && <p className="bg-fc-danger/20 px-3 py-2 text-[#b31d25]">{err}</p>}
            <p className="fc-small text-fc-dark-60">Fica registado nos movimentos e pode ser anulado.</p>
          </div>
          <DialogFooter>
            <Button variant="inverse" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy} onClick={submit}>{busy ? 'A registar…' : 'Confirmar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
