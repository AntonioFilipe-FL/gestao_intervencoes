'use client'

import { useMemo, useRef, useState } from 'react'
import { revealBelow } from '@/lib/scroll-into-view'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { ChevronDown, Minus, Plus, Search, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AccessoryLine } from '@/lib/schemas/intervention'

type Option = { id: string; name: string }

/**
 * Seleção múltipla de acessórios com quantidade.
 * Um único campo: abre uma lista com pesquisa onde se marcam vários acessórios de uma vez;
 * cada escolhido aparece como linha com − / + para a quantidade.
 */
export function AccessoryPicker({
  id,
  options,
  value,
  onChange,
  placeholder = 'Selecione os acessórios',
}: {
  id?: string
  options: Option[]
  value: AccessoryLine[]
  onChange: (v: AccessoryLine[]) => void
  placeholder?: string
}) {
  const [query, setQuery] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o.name])), [options])
  const selected = new Set(value.map((v) => v.accessory_id))

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (!q) return options
    return options.filter((o) => o.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q))
  }, [options, query])

  const toggle = (accId: string) =>
    onChange(selected.has(accId) ? value.filter((v) => v.accessory_id !== accId) : [...value, { accessory_id: accId, quantity: 1 }])

  const setQty = (accId: string, qty: number) =>
    onChange(value.map((v) => (v.accessory_id === accId ? { ...v, quantity: Math.max(1, Math.min(99, qty)) } : v)))

  const total = value.reduce((s, v) => s + v.quantity, 0)

  return (
    <div className="space-y-2">
      <Popover onOpenChange={(open) => (open ? revealBelow(triggerRef.current, 380) : setQuery(''))}>
        <PopoverTrigger
          ref={triggerRef}
          id={id}
          className="flex h-[26px] w-full cursor-pointer items-center justify-between gap-2 rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-left text-[13px] transition-colors outline-none hover:border-fc-dark-60 focus-visible:border-fc-light-60 data-popup-open:border-fc-light-60"
        >
          <span className={cn('truncate', value.length === 0 && 'text-fc-dark-40')}>
            {value.length === 0
              ? placeholder
              : `${value.length} acessório${value.length > 1 ? 's' : ''} · ${total} unidade${total > 1 ? 's' : ''}`}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-fc-dark-100" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--anchor-width) min-w-72 gap-0 p-0"
          initialFocus={() => { inputRef.current?.focus({ preventScroll: true }); return false }}
        >
          <div className="relative border-b border-fc-dark-10 p-2">
            <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-fc-dark-40" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar…"
              className="pl-7"
            />
          </div>
          <ul role="listbox" aria-multiselectable className="max-h-[min(18rem,calc(var(--available-height,18rem)-5.5rem))] overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-fc-dark-60">Sem resultados</li>}
            {filtered.map((o) => {
              const on = selected.has(o.id)
              return (
                <li key={o.id} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(o.id)}
                    className="flex min-h-7 w-full cursor-pointer items-center gap-2 px-3 py-1 text-left text-[13px] hover:bg-fc-grey-100"
                  >
                    <span
                      className={cn(
                        'flex size-3.5 shrink-0 items-center justify-center rounded-[2px] border',
                        on ? 'border-fc-light-100 bg-fc-light-100 text-white' : 'border-fc-dark-40 bg-white'
                      )}
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {o.name}
                  </button>
                </li>
              )
            })}
          </ul>
          {value.length > 0 && (
            <div className="flex items-center justify-between border-t border-fc-dark-10 px-3 py-1.5 text-[12px] text-fc-dark-60">
              <span>{value.length} selecionado{value.length > 1 ? 's' : ''}</span>
              <button type="button" onClick={() => onChange([])} className="cursor-pointer text-fc-light-100 uppercase hover:text-fc-light-60 text-[11px]">
                Limpar
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <ul className="divide-y divide-fc-dark-10 border border-fc-dark-10 bg-white">
          {value.map((v) => (
            <li key={v.accessory_id} className="flex items-center gap-2 py-1 pr-1 pl-3">
              <span className="flex-1 truncate">{byId.get(v.accessory_id) ?? '—'}</span>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  onClick={() => setQty(v.accessory_id, v.quantity - 1)}
                  disabled={v.quantity <= 1}
                  className="flex size-[22px] cursor-pointer items-center justify-center border border-fc-dark-40 bg-fc-grey-80 text-fc-dark-100 hover:bg-fc-dark-10 disabled:cursor-default disabled:text-fc-dark-20"
                >
                  <Minus className="size-3" />
                </button>
                <input
                  aria-label="Quantidade"
                  inputMode="numeric"
                  value={v.quantity}
                  onChange={(e) => setQty(v.accessory_id, Number(e.target.value.replace(/\D/g, '')) || 1)}
                  className="h-[22px] w-9 border-y border-fc-dark-40 bg-white text-center text-[13px] outline-none focus:border-fc-light-60"
                />
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  onClick={() => setQty(v.accessory_id, v.quantity + 1)}
                  className="flex size-[22px] cursor-pointer items-center justify-center border border-fc-dark-40 bg-fc-grey-80 text-fc-dark-100 hover:bg-fc-dark-10"
                >
                  <Plus className="size-3" />
                </button>
              </div>
              <button
                type="button"
                aria-label={`Remover ${byId.get(v.accessory_id) ?? ''}`}
                onClick={() => toggle(v.accessory_id)}
                className="flex size-[22px] cursor-pointer items-center justify-center text-fc-dark-40 hover:text-fc-danger"
              >
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
