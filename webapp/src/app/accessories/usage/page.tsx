import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { getAccessoryUsage } from '@/actions/accessory-stock'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BusySubmit } from '@/components/BusyActions'

type Params = { wh?: string; from?: string; to?: string; type?: string; item?: string }
const fmtDate = (d: string) => d.slice(0, 10).split('-').reverse().join('/')
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const field = 'h-[26px] rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-[13px] outline-none focus:border-fc-light-60'

/** Utilização e entradas de acessórios por armazém (só admin e super admin) */
export default async function AccessoryUsagePage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/accessories')
  const p = await searchParams
  const from = p.from || daysAgo(30)
  const to = p.to || today()
  const type = p.type === 'uso' || p.type === 'entradas' ? p.type : ''
  const [warehouses, items, rows] = await Promise.all([
    sql<{ id: string; name: string }[]>`select id, name from warehouses where active and type <> 'mobilizado' order by name`,
    sql<{ id: string; name: string }[]>`select id, name from accessory_stock_items where active order by name`,
    getAccessoryUsage({ warehouseId: p.wh, from, to, type, itemId: p.item }),
  ])
  // resumo por acessório: utilizado (saídas) e entradas no período
  const sum = new Map<string, { out: number; in: number }>()
  for (const r of rows) {
    const s = sum.get(r.item) ?? { out: 0, in: 0 }
    if (r.quantity < 0) s.out += -r.quantity; else s.in += r.quantity
    sum.set(r.item, s)
  }
  const summary = [...sum.entries()].sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Utilização de acessórios"
        subtitle="Onde foram usados os acessórios de cada armazém (intervenções, transferências, ajustes) e as entradas (receções, retomas, transferências). As contagens não entram."
        actions={<Link href="/accessories" className="fc-small text-fc-light-100 hover:text-fc-light-60">← Stock de acessórios</Link>}
      />
      <Card>
        <CardContent className="pt-5">
          <form className="flex flex-wrap items-end gap-3 fc-small">
            <label className="flex flex-col gap-1">Armazém
              <select name="wh" defaultValue={p.wh ?? ''} className={field}>
                <option value="">Todos</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Acessório
              <select name="item" defaultValue={p.item ?? ''} className={field}>
                <option value="">Todos</option>
                {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1">Tipo
              <select name="type" defaultValue={type} className={field}>
                <option value="">Utilização e entradas</option>
                <option value="uso">Só utilização (saídas)</option>
                <option value="entradas">Só entradas</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">De
              <input type="date" name="from" defaultValue={from} className={field} />
            </label>
            <label className="flex flex-col gap-1">Até
              <input type="date" name="to" defaultValue={to} className={field} />
            </label>
            <BusySubmit label="Filtrar" busyLabel="A filtrar…" />
          </form>
        </CardContent>
      </Card>

      {summary.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Resumo no período</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Acessório</TableHead><TableHead className="text-right">Utilizado / saídas</TableHead><TableHead className="text-right">Entradas</TableHead></TableRow></TableHeader>
              <TableBody>
                {summary.map(([name, s]) => (
                  <TableRow key={name}><TableCell>{name}</TableCell><TableCell className="text-right">{s.out || '—'}</TableCell><TableCell className="text-right">{s.in || '—'}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Movimentos ({rows.length}{rows.length >= 3000 ? ', máx. 3000 — reduza o período' : ''})</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Acessório</TableHead><TableHead>Armazém</TableHead><TableHead>Movimento</TableHead>
                <TableHead className="text-right">Qtd.</TableHead><TableHead>Onde / origem</TableHead><TableHead>Técnico</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-6 text-center text-fc-dark-60">Sem movimentos no período.</TableCell></TableRow>
              ) : rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                  <TableCell>{r.item}</TableCell>
                  <TableCell>{r.warehouse ?? 'Sem armazém'}</TableCell>
                  <TableCell>{r.kind}</TableCell>
                  <TableCell className={`text-right font-semibold ${r.quantity < 0 ? 'text-[#b31d25]' : 'text-[#4b850d]'}`}>{r.quantity > 0 ? `+${r.quantity}` : r.quantity}</TableCell>
                  <TableCell>
                    {r.intervention_id
                      ? <Link href={`/interventions/${r.intervention_id}`} className="text-fc-light-100 hover:text-fc-light-60">{r.detail || 'Intervenção'}</Link>
                      : r.detail || '—'}
                  </TableCell>
                  <TableCell>{r.technician ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
