import { redirect } from 'next/navigation'
import Link from 'next/link'
import { can } from '@/lib/permissions'
import { requireUser } from '@/lib/auth'
import { getMobilizedItems } from '@/actions/stock'
import { filterMobilized, NO_CLIENT as NONE } from '@/lib/mobilized'
import { PageHeader } from '@/components/page-header'
import { FileSpreadsheet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props { searchParams: Promise<{ client?: string; eq?: string; oc?: string; oe?: string }> }

const n = (v: number) => v.toLocaleString('pt-PT')
const fmtDate = (d: string) => d.slice(0, 10).split('-').reverse().join('/')

export default async function MobilizedPage({ searchParams }: Props) {
  const p = await searchParams
  const user = await requireUser()
  if (!can(user, 'stock')) redirect('/help')
  const canSeeImeis = can(user, 'stock', 'write')
  const all = await getMobilizedItems()

  // filtros: cliente (texto) e equipamento (lista)
  const equipments = [...new Set(all.map((i) => i.equipment))].sort((a, b) => a.localeCompare(b, 'pt'))
  const items = filterMobilized(all, p)

  const clientKey = (i: { client_id: string | null }) => i.client_id ?? NONE
  const clients = new Map<string, { key: string; name: string }>()
  for (const i of items) clients.set(clientKey(i), { key: clientKey(i), name: i.client ?? 'Sem cliente atribuído' })
  const rows = [...clients.values()].sort((a, b) => (a.key === NONE ? 1 : b.key === NONE ? -1 : a.name.localeCompare(b.name, 'pt')))
  const cols = [...new Set(items.map((i) => i.equipment))].sort((a, b) => a.localeCompare(b, 'pt'))
  const cell = new Map<string, number>(), rowTot = new Map<string, number>(), colTot = new Map<string, number>()
  for (const i of items) {
    const k = clientKey(i)
    cell.set(`${k}|${i.equipment}`, (cell.get(`${k}|${i.equipment}`) ?? 0) + 1)
    rowTot.set(k, (rowTot.get(k) ?? 0) + 1)
    colTot.set(i.equipment, (colTot.get(i.equipment) ?? 0) + 1)
  }
  const noClient = items.filter((i) => !i.client_id).length
  const viaIntranet = items.filter((i) => i.via === 'intervencao').length

  const href = (q: { oc?: string; oe?: string }) => {
    const s = new URLSearchParams(Object.entries({ client: p.client, eq: p.eq, ...q }).filter(([, v]) => v) as [string, string][])
    return `/stock/mobilized${s.size ? `?${s}` : ''}#imeis`
  }
  const open = canSeeImeis && (p.oc || p.oe)
    ? items.filter((i) => (!p.oc || clientKey(i) === p.oc) && (!p.oe || i.equipment === p.oe))
    : null
  const openTitle = [p.oc ? (clients.get(p.oc)?.name ?? '') : 'Todos os clientes', p.oe ?? 'todos os equipamentos'].join(' · ')
  const exportQuery = new URLSearchParams(Object.entries({ client: p.client, eq: p.eq }).filter(([, v]) => v) as [string, string][]).toString()
  const link = 'text-fc-light-100 hover:text-fc-light-60'

  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Mobilizado por cliente"
        subtitle="Equipamentos no armazém Instalado Aluguer (Mobilizado), por cliente e por equipamento. Clique numa quantidade para ver os IMEIs."
        actions={<>
          <a href={`/stock/mobilized/export${exportQuery ? `?${exportQuery}` : ''}`} className={buttonVariants({ size: 'lg', variant: 'inverse' })}>
            <FileSpreadsheet /> Exportar Excel
          </a>
          <Link href="/stock" className={buttonVariants({ variant: 'inverse', size: 'lg' })}>Voltar ao Stock</Link>
        </>}
      />
      <Card>
        <CardContent className="py-4">
          <form className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-1"><Label>Cliente</Label><Input name="client" defaultValue={p.client ?? ''} placeholder="Parte do nome do cliente" /></div>
            <div className="space-y-1"><Label>Equipamento</Label>
              <select name="eq" defaultValue={p.eq ?? ''} className="h-[26px] w-full rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-[13px]">
                <option value="">Todos</option>
                {equipments.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit" className={buttonVariants({})}>Filtrar</button>
              <Link href="/stock/mobilized" className={buttonVariants({ variant: 'inverse' })}>Limpar</Link>
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="fc-small text-fc-dark-60">
        {n(items.length)} equipamento(s) em {n(rows.filter((r) => r.key !== NONE).length)} cliente(s).
        {viaIntranet > 0 && <> {n(viaIntranet)} sem conta na Intranet, com o cliente da intervenção que os mobilizou.</>}
        {noClient > 0 && <> <b className="text-[#b31d25]">{n(noClient)} sem cliente atribuído</b> — a corrigir.</>}
      </p>

      <Card>
        <CardHeader><CardTitle>Cliente × equipamento</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {items.length === 0 ? <p className="px-4 py-8 text-center text-fc-dark-60">Sem equipamentos mobilizados{p.client || p.eq ? ' para este filtro' : ''}.</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead className="sticky left-0 bg-white">Cliente</TableHead>
                {cols.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className={cn('sticky left-0 bg-white', r.key === NONE && 'font-semibold text-[#b31d25]')}>{r.name}</TableCell>
                    {cols.map((c) => {
                      const q = cell.get(`${r.key}|${c}`)
                      return <TableCell key={c} className={cn('text-right tabular-nums', !q && 'text-fc-dark-40')}>
                        {q ? (canSeeImeis ? <Link href={href({ oc: r.key, oe: c })} className={link}>{n(q)}</Link> : n(q)) : '—'}
                      </TableCell>
                    })}
                    <TableCell className="text-right font-bold tabular-nums">
                      {canSeeImeis ? <Link href={href({ oc: r.key })} className={link}>{n(rowTot.get(r.key) ?? 0)}</Link> : n(rowTot.get(r.key) ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-fc-grey-80 font-bold">
                  <TableCell className="sticky left-0 bg-fc-grey-80">Total</TableCell>
                  {cols.map((c) => <TableCell key={c} className="text-right tabular-nums">
                    {canSeeImeis ? <Link href={href({ oe: c })} className={link}>{n(colTot.get(c) ?? 0)}</Link> : n(colTot.get(c) ?? 0)}
                  </TableCell>)}
                  <TableCell className="text-right tabular-nums">{n(items.length)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {open && (
        <Card id="imeis" className="scroll-mt-4">
          <CardHeader><CardTitle>IMEIs — {openTitle} ({n(open.length)})</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>IMEI</TableHead><TableHead>Equipamento</TableHead><TableHead>Cliente</TableHead><TableHead>Matrícula</TableHead><TableHead>Modalidade</TableHead><TableHead>Desde</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {open.map((i) => (
                  <TableRow key={i.imei}>
                    <TableCell className="font-mono text-[12px]"><Link href={`/stock?imei=${i.imei}#movimentos`} className={link}>{i.imei}</Link></TableCell>
                    <TableCell>{i.equipment}</TableCell>
                    <TableCell>{i.client ?? <span className="text-[#b31d25]">Sem cliente atribuído</span>}{i.via === 'intervencao' && <span className="fc-small text-fc-dark-60"> (pela intervenção)</span>}</TableCell>
                    <TableCell>{i.plate ?? '—'}</TableCell>
                    <TableCell>{i.modality ?? '—'}</TableCell>
                    <TableCell>{fmtDate(i.moved_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
