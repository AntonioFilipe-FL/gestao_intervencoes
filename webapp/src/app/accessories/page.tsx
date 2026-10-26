import { redirect } from 'next/navigation'
import { can } from '@/lib/permissions'
import Link from 'next/link'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { getAccessoryMovements, getAccessoryStock } from '@/actions/accessory-stock'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AccessoryActions } from '@/components/accessories/AccessoryActions'
import { AccessoryMovementDelete } from '@/components/accessories/AccessoryMovementDelete'
import { cn } from '@/lib/utils'

interface Props { searchParams: Promise<{ item?: string; wh?: string; zero?: string }> }

const fmtDate = (d: string) => d.slice(0, 10).split('-').reverse().join('/')
const KIND: Record<string, string> = {
  rececao: 'Receção', transferencia: 'Transferência', contagem: 'Contagem (acerto)', ajuste: 'Ajuste',
  gasto: 'Gasto (intervenção)', retomado: 'Retomado (intervenção)',
}

export default async function AccessoriesStockPage({ searchParams }: Props) {
  const p = await searchParams
  const user = await requireUser()
  if (!can(user, 'accessories')) redirect('/help')
  const isAdmin = can(user, 'accessories', 'write')
  const [{ items, rows }, warehouses] = await Promise.all([
    getAccessoryStock(),
    sql<{ id: string; name: string }[]>`select id, name from warehouses where active and type <> 'mobilizado' order by name`,
  ])
  const NONE = '__none__'
  const key = (wh: string | null) => wh ?? NONE
  // colunas: armazéns com algum movimento (e "Sem armazém" se existir)
  const usedWh = new Set(rows.map((r) => key(r.warehouse_id)))
  const cols = [
    ...warehouses.filter((w) => usedWh.has(w.id)).map((w) => ({ id: w.id, name: w.name })),
    ...(usedWh.has(NONE) ? [{ id: NONE, name: 'Sem armazém' }] : []),
  ].filter((c) => !p.wh || c.id === p.wh)
  const qty = new Map(rows.map((r) => [`${r.item_id}|${key(r.warehouse_id)}`, r.quantity]))
  const counted = new Map(rows.filter((r) => r.counted_at).map((r) => [`${r.item_id}|${key(r.warehouse_id)}`, r.counted_at!]))
  const total = (itemId: string) => cols.reduce((a, c) => a + (qty.get(`${itemId}|${c.id}`) ?? 0), 0)
  const shown = items.filter((i) => p.zero === '1' || cols.some((c) => (qty.get(`${i.id}|${c.id}`) ?? 0) !== 0))
  const selected = items.find((i) => i.id === p.item)
  const moves = isAdmin && selected ? await getAccessoryMovements(selected.id, p.wh && p.wh !== NONE ? p.wh : undefined) : []
  const href = (q: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries({ item: p.item, wh: p.wh, zero: p.zero, ...q }).filter(([, v]) => v) as [string, string][])
    return `/accessories${s.size ? `?${s}` : ''}`
  }

  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Stock de acessórios"
        subtitle="Quantidades por armazém: última contagem + receções, transferências e acessórios gastos/retomados nas intervenções"
        actions={isAdmin && <AccessoryActions items={items} warehouses={warehouses} />}
      />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-3">
          <CardTitle className="flex-1">Por armazém</CardTitle>
          <form action="/accessories" className="flex items-center gap-2">
            {p.zero && <input type="hidden" name="zero" value={p.zero} />}
            <select name="wh" defaultValue={p.wh ?? ''} className="h-[26px] rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-[13px]">
              <option value="">Todos os armazéns</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <button className="h-[26px] bg-fc-dark-100 px-3 text-[12px] font-bold text-white uppercase">Filtrar</button>
          </form>
          <Link href={href({ zero: p.zero === '1' ? undefined : '1' })} className="fc-small text-fc-light-100 underline">
            {p.zero === '1' ? 'Esconder itens sem stock' : 'Mostrar todos os itens'}
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-fc-dark-60">Sem movimentos de acessórios para mostrar.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Acessório</TableHead>
                  {cols.map((c) => <TableHead key={c.id} className="text-right">{c.name}</TableHead>)}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((i) => (
                  <TableRow key={i.id} className={cn(p.item === i.id && 'bg-fc-light-100/10')}>
                    <TableCell>
                      {isAdmin ? <Link href={`${href({ item: i.id })}#movimentos`} className="text-fc-light-100 hover:text-fc-light-60">{i.name}</Link> : i.name}
                    </TableCell>
                    {cols.map((c) => {
                      const v = qty.get(`${i.id}|${c.id}`)
                      const ct = counted.get(`${i.id}|${c.id}`)
                      return (
                        <TableCell key={c.id} className={cn('text-right tabular-nums', v == null && 'text-fc-dark-40', v != null && v < 0 && 'font-bold text-[#b31d25]')}
                          title={ct ? `Contado em ${fmtDate(ct)}` : 'Sem contagem: soma de todo o histórico'}>
                          {v == null ? '—' : v.toLocaleString('pt-PT')}{ct && <span className="ml-0.5 text-[10px] text-[#4b850d]">✓</span>}
                        </TableCell>
                      )
                    })}
                    <TableCell className="text-right font-bold tabular-nums">{total(i.id).toLocaleString('pt-PT')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <p className="fc-small text-fc-dark-60">
        ✓ = armazém com contagem registada (o valor parte dessa contagem). Sem ✓, o valor é a soma de todo o histórico — registe uma
        <b> Contagem</b> para acertar com o que existe fisicamente. Valores negativos indicam saídas sem entradas registadas.
      </p>

      {isAdmin && selected && (
        <Card id="movimentos" className="scroll-mt-4">
          <CardHeader className="flex flex-row items-center gap-3">
            <CardTitle className="flex-1">Movimentos · {selected.name}</CardTitle>
            <Link href={href({ item: undefined })} className="fc-small text-fc-light-100 underline">Fechar</Link>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>Armazém</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead><TableHead>Origem</TableHead><TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {moves.map((m, idx) => (
                  <TableRow key={`${m.id ?? m.intervention_id}-${idx}`}>
                    <TableCell>{fmtDate(m.date)}</TableCell>
                    <TableCell>{KIND[m.kind] ?? m.kind}</TableCell>
                    <TableCell>{m.warehouse ?? <span className="text-[#c7830b]">Sem armazém</span>}</TableCell>
                    <TableCell className={cn('text-right tabular-nums', m.kind !== 'contagem' && m.quantity < 0 && 'text-[#b31d25]')}>
                      {m.kind === 'contagem' ? `= ${m.quantity}` : m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </TableCell>
                    <TableCell className="text-fc-dark-60">
                      {m.intervention_id ? <Link href={`/interventions/${m.intervention_id}`} className="text-fc-light-100">{m.origin || 'Intervenção'}</Link> : m.origin || '—'}
                    </TableCell>
                    <TableCell className="text-right">{m.manual && m.id ? <AccessoryMovementDelete id={m.id} /> : '—'}</TableCell>
                  </TableRow>
                ))}
                {moves.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-fc-dark-60">Sem movimentos.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
