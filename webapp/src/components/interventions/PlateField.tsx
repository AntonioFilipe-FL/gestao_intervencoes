'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getClientDevices, type DeviceOption } from '@/actions/intranet'
import { cn } from '@/lib/utils'
import { revealBelow } from '@/lib/scroll-into-view'

const normPlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

/**
 * Campo Matrícula com as matrículas do cliente escolhido (viaturas da Intranet).
 * Ao abrir mostra todas as viaturas do cliente; escrever filtra por matrícula ou IMEI.
 * Continua a aceitar escrita livre (viatura ainda não registada na Intranet).
 */
export function PlateField({
  id,
  value,
  onChange,
  onPick,
  clientId,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  onPick?: (d: DeviceOption) => void
  clientId?: string
}) {
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState<{ clientId: string; devices: DeviceOption[] } | null>(null)
  const devices = useMemo(() => (clientId && loaded?.clientId === clientId ? loaded.devices : []), [clientId, loaded])
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancel = false
    if (clientId) getClientDevices(clientId).then((d) => !cancel && setLoaded({ clientId, devices: d.filter((x) => x.license_plate) }))
    return () => { cancel = true }
  }, [clientId])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const suggestions = useMemo(() => {
    const q = normPlate(value)
    const list = q ? devices.filter((d) => normPlate(d.license_plate ?? '').includes(q) || d.imei.includes(q)) : devices
    return list.slice(0, 100)
  }, [devices, value])

  // matrícula escrita que corresponde exatamente a uma viatura do cliente
  const exact = devices.find((d) => normPlate(d.license_plate ?? '') === normPlate(value))

  const pick = (d: DeviceOption) => {
    onChange(d.license_plate ?? '')
    onPick?.(d)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(suggestions[active]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  const placeholder = clientId
    ? devices.length ? `${devices.length} viatura(s) do cliente — escolha ou escreva` : 'Sem viaturas deste cliente na Intranet — escreva a matrícula'
    : 'Escolha primeiro o cliente (ou escreva a matrícula)'

  return (
    <div ref={boxRef} className="relative space-y-1">
      <input
        id={id}
        value={value}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value.toUpperCase()); setOpen(true); setActive(0) }}
        onFocus={(e) => { setOpen(true); revealBelow(e.currentTarget, 280) }}
        onKeyDown={onKeyDown}
        className="h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-[13px] text-fc-dark-100 outline-none placeholder:text-fc-dark-40 hover:border-fc-dark-60 focus:border-fc-light-60"
      />
      {open && suggestions.length > 0 && !(exact && suggestions.length === 1) && (
        <ul className="absolute top-[28px] right-0 left-0 z-40 max-h-64 overflow-y-auto border border-fc-dark-20 bg-white py-1 shadow-[0_2px_6px_rgba(38,54,70,0.2)]">
          {suggestions.map((d, i) => (
            <li key={d.imei}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(d) }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1 text-left text-[13px]', i === active && 'bg-fc-grey-100')}
              >
                <span className="font-mono text-[12px]">{d.license_plate}</span>
                <span className="truncate text-fc-dark-60">{[d.model, d.imei].filter(Boolean).join(' · ')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {clientId && value && devices.length > 0 && !exact && normPlate(value).length >= 6 && (
        <p className="fc-small text-[#c7830b]">Esta matrícula não está nas viaturas do cliente na Intranet.</p>
      )}
    </div>
  )
}
