'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export type SelectOption = { value: string; label: string }

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Lista de escolha com caixa de pesquisa (FROTCOM Styleguide: dropdown com pesquisa).
 * Teclado: escrever filtra · ↑/↓ navega · Enter escolhe · Esc fecha.
 */
export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Selecione…',
  clearable = true,
  invalid,
}: {
  id?: string
  options: SelectOption[]
  value: string | null | undefined
  onChange: (value: string) => void
  placeholder?: string
  /** permite limpar a escolha (volta a vazio) */
  clearable?: boolean
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  const selected = options.find((o) => o.value === value)
  const filtered = useMemo(() => {
    const q = fold(query.trim())
    return q ? options.filter((o) => fold(o.label).includes(q)) : options
  }, [options, query])

  // manter a opção ativa visível
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[active]) choose(filtered[active].value) }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setQuery('')
          setActive(Math.max(0, options.findIndex((x) => x.value === value)))
        }
      }}
    >
      <PopoverTrigger
        id={id}
        aria-invalid={invalid || undefined}
        className={cn(
          'flex h-[26px] w-full cursor-pointer items-center justify-between gap-2 rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-left text-[13px] transition-colors outline-none hover:border-fc-dark-60 focus-visible:border-fc-light-60 data-popup-open:border-fc-light-60 aria-invalid:border-fc-danger'
        )}
      >
        <span className={cn('truncate', !selected && 'text-fc-dark-40')}>{selected?.label ?? placeholder}</span>
        <span className="flex shrink-0 items-center gap-1">
          {clearable && selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onChange('') }}
              className="flex size-4 items-center justify-center text-fc-dark-40 hover:text-fc-dark-100"
            >
              <X className="size-3" />
            </span>
          )}
          <ChevronDown className="size-3.5 text-fc-dark-100" />
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-56 gap-0 p-0">
        <div className="relative border-b border-fc-dark-10 p-2">
          <Search className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-fc-dark-40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0) }}
            onKeyDown={onKeyDown}
            placeholder="Pesquisar…"
            aria-label="Pesquisar"
            className="h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 pr-2 pl-7 text-[13px] outline-none placeholder:text-fc-dark-40 focus:border-fc-light-60"
          />
        </div>
        <ul ref={listRef} role="listbox" className="max-h-72 overflow-y-auto py-1">
          {filtered.length === 0 && <li className="px-3 py-2 text-fc-dark-60">Sem resultados</li>}
          {filtered.map((o, i) => {
            const isSel = o.value === value
            return (
              <li key={o.value} role="option" aria-selected={isSel} data-index={i}>
                <button
                  type="button"
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    'flex min-h-7 w-full cursor-pointer items-center justify-between gap-2 px-3 py-1 text-left text-[13px]',
                    isSel ? 'bg-fc-dark-100 text-white' : i === active ? 'bg-fc-grey-100' : ''
                  )}
                >
                  <span>{o.label}</span>
                  {isSel && <Check className="size-3.5 shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
