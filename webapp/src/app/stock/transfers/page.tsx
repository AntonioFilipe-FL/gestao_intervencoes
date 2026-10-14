import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { getMovementBatches } from '@/actions/stock'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buttonVariants } from '@/components/ui/button'

interface Props { searchParams: Promise<{ from?: string; to?: string; wh?: string; kind?: string; q?: string }> }

const fmtDate = (d: string) => d.slice(0, 10).split('-').reverse().join('/')
const fmtTime = (d: string) => new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' })
const KIND: Record<string, string> = { transferencia: 'Transferência', rececao: 'Receção', ajuste: 'Ajuste / Dar saída' }

export default async function TransfersHistoryPage({ searchParams }: Props) {
  const p = await searchParams
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/stock')
  const kind = p.kind ?? 'transferencia'
  const [batches, warehouses] = await Promise.all([
    getMovementBatches({ ...p, kind: kind === 'todos' ? undefined : kind }),
    sql<{ id: string; name: string }[]>`select id, name from warehouses order by name`,
  ])
  const sel = 'h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-[13px]'

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Histórico de transferências"
        subtitle="Movimentos registados à mão no Stock, agrupados por lote (o mesmo registo, com a mesma origem e destino)"
        actions={<Link href="/stock" className={buttonVariants({ variant: 'inverse', size: 'lg' })}>Voltar ao Stock</Link>}
      />
      <Card>
        <CardContent className="py-4">
          <form className="grid grid-cols-1 items-end gap-3 md:grid-cols-[9.5rem_9.5rem_1fr_12rem_1fr_auto]">
            <div className="space-y-1.5"><Label htmlFor="from">Data de</Label><Input id="from" name="from" type="date" defaultValue={p.from} /></div>
            <div className="space-y-1.5"><Label htmlFor="to">Data até</Label><Input id="to" name="to" type="date" defaultValue={p.to} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="wh">Armazém (origem ou destino)</Label>
              <select id="wh" name="wh" defaultValue={p.wh ?? ''} className={sel}>
                <option value="">Todos</option>
                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kind">Tipo</Label>
              <select id="kind" name="kind" defaultValue={kind} className={sel}>
                <option value="transferencia">Transferências</option>
                <option value="rececao">Receções</option>
                <option value="ajuste">Ajustes / Dar saída</option>
                <option value="todos">Todos</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="q">Contém o IMEI</Label><Input id="q" name="q" defaultValue={p.q} placeholder="IMEI" className="font-mono" /></div>
            <div className="flex gap-2">
              <button type="submit" className={buttonVariants({ variant: 'secondary' })}>Filtrar</button>
              <Link href="/stock/transfers" className={buttonVariants({ variant: 'inverse' })}>Limpar</Link>
            </div>
          </form>
        </CardContent>
      </Card>

      {batches.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-fc-dark-60">Sem movimentos para este filtro.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {batches.map((b) => (
            <details key={b.key} className="border border-fc-dark-20 bg-white">
              <summary className="flex cursor-pointer flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 hover:bg-fc-grey-80">
                <span className="w-24 font-bold">{fmtDate(b.moved_at)}</span>
                <span className="w-36 text-fc-dark-60">{KIND[b.kind] ?? b.kind}</span>
                <span className="min-w-64 flex-1">
                  {b.from_wh ?? '—'} <span className="text-fc-dark-60">→</span> <b>{b.to_wh ?? (b.kind === 'ajuste' ? 'fora do stock' : '—')}</b>
                </span>
                <span className="w-20 text-right tabular-nums"><b>{b.n}</b> IMEI{b.n === 1 ? '' : 's'}</span>
                {b.superseded > 0 && <span className="fc-small text-[#c7830b]">{b.superseded} já não conta{b.superseded === 1 ? '' : 'm'}</span>}
                <span className="fc-small w-64 truncate text-fc-dark-60" title={b.notes ?? undefined}>{b.created_by} · {fmtTime(b.created_at)}</span>
              </summary>
              <div className="border-t border-fc-dark-10 px-4 py-2">
                {b.notes && <p className="fc-small mb-2 text-fc-dark-60">Observações: {b.notes}</p>}
                <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-4">
                  {b.imeis.map((i) => (
                    <Link key={i.imei} href={`/stock?imei=${i.imei}#movimentos`}
                      className={`flex justify-between gap-2 border-b border-fc-dark-10 py-1 fc-small hover:bg-fc-grey-80 ${i.superseded ? 'text-fc-dark-40 line-through' : ''}`}>
                      <span className="font-mono text-fc-light-100">{i.imei}</span>
                      <span className="text-fc-dark-60">{[i.equipment, i.modality].filter(Boolean).join(' · ')}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </details>
          ))}
          {batches.length === 200 && <p className="fc-small text-fc-dark-60">A mostrar os 200 lotes mais recentes — use os filtros para afinar.</p>}
        </div>
      )}
    </div>
  )
}
