/** Barras horizontais empilhadas: total por item (equipamento/cliente) repartido por tipo de intervenção */
const TYPE_ORDER = [
  'Instalação', 'Instalação - Try and Buy', 'Reinstalação', 'Upgrade',
  'Assistência', 'Troca De Viatura', 'Desinstalação', 'Desinstalação Try and Buy',
]
// cores categóricas distintas (legíveis em fundo branco); cada tipo mantém sempre a mesma cor
const COLORS = ['#0079c1', '#7fb8e0', '#2a9d8f', '#8ac926', '#e9a23b', '#9b5de5', '#d1495b', '#f4a3ae']

export function StackedByType({
  rows,
  keepOrder = false,
  label = (n: string) => n,
  table = false,
}: {
  rows: { name: string; type: string; count: number }[]
  /** mantém a ordem recebida (ex.: meses) em vez de ordenar pelo total */
  keepOrder?: boolean
  label?: (name: string) => string
  /** mostra também uma tabela com os valores por tipo */
  table?: boolean
}) {
  if (rows.length === 0) return <p className="text-fc-dark-60">Sem dados.</p>
  const types = [...new Set(rows.map((r) => r.type))].sort(
    (a, b) => (TYPE_ORDER.indexOf(a) + 1 || 99) - (TYPE_ORDER.indexOf(b) + 1 || 99)
  )
  const color = (t: string) => COLORS[(TYPE_ORDER.indexOf(t) + COLORS.length) % COLORS.length]
  const items = Object.values(
    rows.reduce<Record<string, { name: string; total: number; parts: Record<string, number> }>>((acc, r) => {
      const it = (acc[r.name] ??= { name: r.name, total: 0, parts: {} })
      it.total += r.count
      it.parts[r.type] = r.count
      return acc
    }, {})
  )
  if (!keepOrder) items.sort((a, b) => b.total - a.total)
  const max = Math.max(1, ...items.map((i) => i.total))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {types.map((t) => (
          <span key={t} className="flex items-center gap-1.5 text-[12px] text-fc-dark-60">
            <span className="size-2.5 rounded-[2px]" style={{ background: color(t) }} /> {t}
          </span>
        ))}
      </div>
      <div className="space-y-3">
        {items.map((it) => (
          <div key={it.name} className="flex items-center gap-4">
            <div className="w-40 truncate text-[12px] text-fc-dark-60 capitalize" title={label(it.name)}>{label(it.name)}</div>
            <div className="flex h-3 flex-1 overflow-hidden bg-fc-grey-100">
              <div className="flex h-full" style={{ width: `${(it.total / max) * 100}%` }}>
                {types.filter((t) => it.parts[t]).map((t) => (
                  <div
                    key={t}
                    className="h-full"
                    style={{ width: `${(it.parts[t] / it.total) * 100}%`, background: color(t) }}
                    title={`${label(it.name)} · ${t}: ${it.parts[t].toLocaleString('pt-PT')}`}
                  />
                ))}
              </div>
            </div>
            <div className="w-12 text-right text-[12px] tabular-nums">{it.total.toLocaleString('pt-PT')}</div>
          </div>
        ))}
      </div>
      <p className="fc-small text-fc-dark-60">Passe o rato sobre cada cor para ver o número de cada tipo.</p>
      {table && (
        <div className="overflow-x-auto border border-fc-dark-10">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-fc-dark-80 text-white">
                <th className="px-3 py-2 text-left font-normal">Tipo</th>
                {items.map((it) => <th key={it.name} className="px-2 py-2 text-right font-normal capitalize">{label(it.name)}</th>)}
                <th className="px-3 py-2 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {types.map((t, i) => (
                <tr key={t} className={i % 2 === 0 ? 'bg-fc-grey-80' : ''}>
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <span className="mr-1.5 inline-block size-2.5 rounded-[2px] align-middle" style={{ background: color(t) }} />{t}
                  </td>
                  {items.map((it) => <td key={it.name} className="px-2 py-1.5 text-right tabular-nums">{it.parts[t] ? it.parts[t].toLocaleString('pt-PT') : '—'}</td>)}
                  <td className="px-3 py-1.5 text-right font-bold tabular-nums">{items.reduce((a, it) => a + (it.parts[t] ?? 0), 0).toLocaleString('pt-PT')}</td>
                </tr>
              ))}
              <tr className="border-t border-fc-dark-20 font-bold">
                <td className="px-3 py-1.5">Total</td>
                {items.map((it) => <td key={it.name} className="px-2 py-1.5 text-right tabular-nums">{it.total.toLocaleString('pt-PT')}</td>)}
                <td className="px-3 py-1.5 text-right tabular-nums">{items.reduce((a, it) => a + it.total, 0).toLocaleString('pt-PT')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
