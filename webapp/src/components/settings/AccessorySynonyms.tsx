'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { deleteAccessorySynonym, saveAccessorySynonym, type SynonymRow } from '@/actions/accessory-synonyms'

const NONE = '__none__'

/** Sinónimos: como o material vem escrito nos formulários do Creator → acessório da lista */
export function AccessorySynonyms({ rows, accessories }: { rows: SynonymRow[]; accessories: { id: string; name: string }[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [label, setLabel] = useState('')
  const [acc, setAcc] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const opts = [{ value: NONE, label: '— Sem stock na app (ignorar) —' }, ...accessories.map((a) => ({ value: a.id, label: a.name }))]
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn()
    setErr(r.ok ? null : r.error ?? 'Erro')
    if (r.ok) after?.()
    router.refresh()
  })
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-bold">Sinónimos de acessórios (formulários do Creator)</h3>
        <p className="fc-small text-fc-dark-60">
          Como os técnicos escrevem o material (ex.: &ldquo;iman&rdquo;, &ldquo;calhas&rdquo;, &ldquo;cabo duplo&rdquo;) e a que acessório corresponde.
          Usado para sugerir os acessórios gastos nas intervenções por confirmar. Escolha &ldquo;Sem stock na app&rdquo; para o material que não se controla.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Texto no formulário (ex.: iman)" className="max-w-xs" />
        <div className="w-80"><SearchableSelect options={opts} value={acc} onChange={setAcc} placeholder="Acessório da lista" /></div>
        <Button disabled={busy || !label.trim() || !acc} onClick={() => run(() => saveAccessorySynonym(label, acc === NONE ? '' : acc), () => { setLabel(''); setAcc('') })}>Guardar</Button>
      </div>
      {err && <p className="bg-fc-danger/20 px-3 py-2 text-[#b31d25]">{err}</p>}
      <div className="border border-fc-dark-20">
        <table className="w-full text-[13px]">
          <thead><tr className="bg-fc-grey-80 text-left"><th className="px-3 py-2">Texto no formulário</th><th className="px-3 py-2">Acessório</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-3 py-5 text-center text-fc-dark-60">Ainda não há sinónimos.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.term} className="border-t border-fc-dark-10">
                <td className="px-3 py-1.5 font-semibold">{r.label}</td>
                <td className="px-3 py-1.5">{r.accessory_id ? r.accessory : <span className="text-fc-dark-60">Sem stock na app (ignorar)</span>}</td>
                <td className="px-3 py-1.5 text-right">
                  <Button variant="ghost" size="icon" className="text-fc-danger hover:bg-fc-danger/10" disabled={busy}
                    onClick={() => confirm(`Apagar o sinónimo “${r.label}”?`) && run(() => deleteAccessorySynonym(r.term))}><Trash2 /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
