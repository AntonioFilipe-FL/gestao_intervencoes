'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { getClientDevices, lookupImei, searchDevices, type DeviceOption, type ImeiLookup } from '@/actions/intranet'
import { cn } from '@/lib/utils'
import { revealBelow } from '@/lib/scroll-into-view'

type Suggestion = DeviceOption & { client_name?: string | null }

/**
 * Campo IMEI com sugestões da Intranet e validação.
 *  scope="client": sugere os IMEIs do cliente escolhido e avisa se o IMEI é de outro cliente.
 *  scope="global": pesquisa em todos os IMEIs (ex.: equipamento gasto, ainda em stock).
 * Continua a aceitar escrita manual (ex.: equipamento novo ainda não registado), mas assinala-a.
 */
export function ImeiField({
  id,
  value,
  onChange,
  onPick,
  clientId,
  clientName,
  scope = 'client',
  retired = false,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  onPick?: (d: Suggestion) => void
  clientId?: string
  clientName?: string
  scope?: 'client' | 'global'
  /** equipamento retirado da viatura: IMEI inativo/inexistente na Intranet é normal (sem aviso) */
  retired?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [clientDevices, setClientDevices] = useState<Suggestion[]>([])
  const [remote, setRemote] = useState<Suggestion[]>([])
  const [status, setStatus] = useState<ImeiLookup | null>(null)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  // IMEIs do cliente escolhido
  useEffect(() => {
    let cancel = false
    if (scope === 'client' && clientId) getClientDevices(clientId).then((d) => !cancel && setClientDevices(d))
    else setClientDevices([])
    return () => { cancel = true }
  }, [clientId, scope])

  // pesquisa global (com atraso para não fazer um pedido por tecla)
  useEffect(() => {
    if (scope !== 'global') return
    const t = setTimeout(() => searchDevices(value).then(setRemote), 250)
    return () => clearTimeout(t)
  }, [value, scope])

  // validação do IMEI escrito
  useEffect(() => {
    const v = value.replace(/\s/g, '')
    if (!/^\d{15}$/.test(v)) { setStatus(null); return }
    const t = setTimeout(() => lookupImei(v).then(setStatus), 300)
    return () => clearTimeout(t)
  }, [value])

  // fechar ao clicar fora
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const suggestions = useMemo(() => {
    if (scope === 'global') return remote
    const q = value.replace(/\s/g, '').toUpperCase()
    const list = q
      ? clientDevices.filter((d) => d.imei.includes(q) || (d.license_plate ?? '').toUpperCase().replace(/[\s-]/g, '').includes(q.replace(/-/g, '')))
      : clientDevices
    return list.slice(0, 50)
  }, [scope, remote, clientDevices, value])

  const pick = (d: Suggestion) => {
    onChange(d.imei)
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

  // mensagem de validação
  let msg: { tone: 'ok' | 'warn'; text: string } | null = null
  if (status) {
    if (!status.found) msg = retired ? null : { tone: 'warn', text: 'IMEI não encontrado na Intranet — confirme se está correto.' }
    else if (!status.active) msg = retired ? null : { tone: 'warn', text: 'IMEI inativo na Intranet.' }
    else if (scope === 'client' && clientId && status.accountClientIds.length > 0 && !status.accountClientIds.includes(clientId))
      msg = { tone: 'warn', text: `Este IMEI pertence a outro cliente: ${status.clientName ?? '—'}.` }
    else msg = { tone: 'ok', text: [status.model, status.license_plate, scope === 'global' ? status.clientName : null].filter(Boolean).join(' · ') || 'IMEI válido na Intranet' }
  }

  const placeholder =
    scope === 'client'
      ? clientId
        ? clientDevices.length ? `${clientDevices.length} equipamento(s) de ${clientName ?? 'cliente'} — escreva ou escolha` : 'Sem IMEIs deste cliente na Intranet — escreva o IMEI'
        : 'Escolha primeiro o cliente'
      : 'Escreva o IMEI ou a matrícula'

  return (
    <div ref={boxRef} className="relative space-y-1">
      <input
        id={id}
        value={value}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0) }}
        onFocus={(e) => { setOpen(true); revealBelow(e.currentTarget, 280) }}
        onKeyDown={onKeyDown}
        aria-invalid={msg?.tone === 'warn' || undefined}
        className="h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-[13px] text-fc-dark-100 outline-none placeholder:text-fc-dark-40 hover:border-fc-dark-60 focus:border-fc-light-60 aria-invalid:border-fc-warning"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute top-[28px] right-0 left-0 z-40 max-h-64 overflow-y-auto border border-fc-dark-20 bg-white py-1 shadow-[0_2px_6px_rgba(38,54,70,0.2)]">
          {suggestions.map((d, i) => (
            <li key={d.imei}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(d) }}
                onMouseEnter={() => setActive(i)}
                className={cn('flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-1 text-left text-[13px]', i === active && 'bg-fc-grey-100')}
              >
                <span className="font-mono text-[12px]">{d.imei}</span>
                <span className="truncate text-fc-dark-60">
                  {[d.license_plate, d.model, d.client_name].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && (
        <p className={cn('fc-small flex items-center gap-1', msg.tone === 'ok' ? 'text-[#4b850d]' : 'text-[#c7830b]')}>
          {msg.tone === 'ok' ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />} {msg.text}
        </p>
      )}
    </div>
  )
}
