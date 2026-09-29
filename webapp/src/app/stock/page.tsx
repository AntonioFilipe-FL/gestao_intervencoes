import Link from 'next/link'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { getInstalledConflicts, getMovements, getStockItems, getStockTotals } from '@/actions/stock'
import { AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { buttonVariants } from '@/components/ui/button'
import { StockActions } from '@/components/stock/StockActions'
import { MovementDelete } from '@/components/stock/MovementDelete'
import { RemoveInstalled } from '@/components/stock/RemoveInstalled'
import { cn } from '@/lib/utils'

interface Props {
  searchParams: Promise<{ wh?: string; mod?: string; q?: string; imei?: string; inst?: string }>
}

const fmtDate = (d: string) => d.slice(0, 10).split('-').reverse().join('/')
const n = (v: number) => v.toLocaleString('pt-PT')
const KIND: Record<string, string> = {
  rececao: 'Receção',
  transferencia: 'Transferência',
  intervencao_saida: 'Saída (intervenção)',
  intervencao_entrada: 'Entrada (retoma)',
  ajuste: 'Ajuste',
}

export default async function StockPage({ searchParams }: Props) {
  const p = await searchParams
  const user = await requireUser()
  const isAdmin = user.role === 'admin'
  const [{ byWarehouse, byModel }, items, movements, warehouses, equipment, conflicts] = await Promise.all([
    getStockTotals(),
    isAdmin ? getStockItems({ warehouseId: p.wh, modality: p.mod, q: p.q, installed: p.inst === '1' }) : Promise.resolve([]),
    isAdmin ? getMovements(p.imei) : Promise.resolve([]),
    sql<{ id: string; name: string }[]>`select id, name from warehouses where active order by name`,
    sql<{ id: string; name: string }[]>`select id, name from equipment_list where active order by name`,
    getInstalledConflicts(),
  ])
  const conflictOf = (wh?: string) => conflicts.filter((c) => !wh || c.warehouse_id === wh).reduce((a, c) => a + c.n, 0)

  const total = byWarehouse.reduce((a, w) => ({ venda: a.venda + w.venda, aluguer: a.aluguer + w.aluguer, sem: a.sem + w.sem, total: a.total + w.total }), { venda: 0, aluguer: 0, sem: 0, total: 0 })
  const href = (q: Record<string, string | undefined>) => {
    const s = new URLSearchParams(Object.entries({ wh: p.wh, mod: p.mod, q: p.q, inst: p.inst, ...q }).filter(([, v]) => v) as [string, string][])
    return `/stock${s.size ? `?${s}` : ''}`
  }
  const selectedWh = byWarehouse.find((w) => w.warehouse_id === p.wh)
  const models = byModel.filter((m) => !p.wh || m.warehouse_id === p.wh)
  const modelAgg = Object.values(
    models.reduce<Record<string, { equipment: string; venda: number; aluguer: number; sem: number; total: number }>>((acc, m) => {
      const a = (acc[m.equipment] ??= { equipment: m.equipment, venda: 0, aluguer: 0, sem: 0, total: 0 })
      a.venda += m.venda; a.aluguer += m.aluguer; a.sem += m.sem; a.total += m.total
      return acc
    }, {})
  ).sort((a, b) => b.total - a.total)

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Stock material"
        subtitle={isAdmin ? 'Equipamentos em stock por IMEI. Receções e transferências registam-se aqui; as intervenções descontam (IMEI gasto) e acrescentam (IMEI retomado) automaticamente.' : 'Equipamentos em stock por armazém.'}
        actions={isAdmin && <StockActions warehouses={warehouses} equipment={equipment} />}
      />

      {/* Totalizadores por armazém */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link href={href({ wh: undefined })} className={cn('block', !p.wh && 'ring-2 ring-fc-light-60')}>
          <Card className="h-full">
            <CardHeader><CardTitle>Total em stock</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <div className="text-[28px] leading-9 font-light text-fc-dark-100">{n(total.total)}</div>
              <p className="fc-small text-fc-dark-60">Venda {n(total.venda)} · Aluguer {n(total.aluguer)}{total.sem ? ` · Sem modalidade ${n(total.sem)}` : ''}</p>
            </CardContent>
          </Card>
        </Link>
        {byWarehouse.map((w) => (
          <Link key={w.warehouse_id} href={href({ wh: w.warehouse_id })} className={cn('block', p.wh === w.warehouse_id && 'ring-2 ring-fc-light-60')}>
            <Card className="h-full">
              <CardHeader><CardTitle>{w.warehouse}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="text-[28px] leading-9 font-light text-fc-dark-100">{n(w.total)}</div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="info">Venda {n(w.venda)}</Badge>
                  <Badge variant="secondary">Aluguer {n(w.aluguer)}</Badge>
                  {w.sem > 0 && <Badge variant="secondary">Sem modalidade {n(w.sem)}</Badge>}
                  {conflictOf(w.warehouse_id) > 0 && <Badge variant="warning">Instalados na Intranet {n(conflictOf(w.warehouse_id))}</Badge>}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {/* detalhe (lista de IMEIs, movimentos, avisos) só para admin */}
      {isAdmin && (<>
      {conflictOf(p.wh) > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-fc-warning bg-fc-warning/10 px-4 py-3">
          <p className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[#c7830b]" />
            <span>
              <b>{n(conflictOf(p.wh))} IMEI(s)</b> aparecem em stock{p.wh ? ' neste armazém' : ''}, mas a Intranet mostra-os <b>instalados numa viatura</b>.
              Provavelmente falta registar a instalação (ou a Intranet está desatualizada).
            </span>
          </p>
          <div className="flex gap-2">
            <Link href={href({ inst: p.inst === '1' ? undefined : '1' })} className={buttonVariants({ variant: p.inst === '1' ? 'secondary' : 'inverse', size: 'sm' })}>
              {p.inst === '1' ? 'Mostrar todos' : 'Ver só estes'}
            </Link>
            <RemoveInstalled warehouseId={p.wh} count={conflictOf(p.wh)} warehouses={warehouses} />
          </div>
        </div>
      )}
      {byWarehouse.length === 0 && (
        <Card><CardContent className="py-8 text-center text-fc-dark-60">
          Ainda não há equipamentos em stock. O stock é calculado a partir das intervenções (armazém de saída/entrada) e das receções e transferências registadas aqui.
        </CardContent></Card>
      )}

      {/* Por modelo */}
      {modelAgg.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Por equipamento {selectedWh ? `· ${selectedWh.warehouse}` : '· todos os armazéns'}</CardTitle></CardHeader>
          <Table>
            <TableHeader><TableRow>
              <TableHead>Equipamento</TableHead><TableHead className="text-right">Venda</TableHead><TableHead className="text-right">Aluguer</TableHead>
              <TableHead className="text-right">Sem modalidade</TableHead><TableHead className="text-right">Total</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {modelAgg.map((m) => (
                <TableRow key={m.equipment}>
                  <TableCell>{m.equipment}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(m.venda)}</TableCell>
                  <TableCell className="text-right tabular-nums">{n(m.aluguer)}</TableCell>
                  <TableCell className="text-right tabular-nums text-fc-dark-60">{m.sem ? n(m.sem) : '—'}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{n(m.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* IMEIs em stock */}
      <Card>
        <CardHeader><CardTitle>IMEIs em stock {selectedWh ? `· ${selectedWh.warehouse}` : ''}</CardTitle></CardHeader>
        <CardContent className="pb-3">
          <form className="flex flex-wrap items-end gap-3">
            {p.wh && <input type="hidden" name="wh" value={p.wh} />}
            {p.inst && <input type="hidden" name="inst" value={p.inst} />}
            <div className="space-y-1.5">
              <Label htmlFor="q">IMEI / equipamento</Label>
              <Input id="q" name="q" defaultValue={p.q} placeholder="Pesquisar" className="w-64" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mod">Modalidade</Label>
              <select id="mod" name="mod" defaultValue={p.mod ?? ''} className="h-[26px] rounded-[2px] border border-fc-dark-40 bg-fc-grey-80 px-2 text-[13px]">
                <option value="">Todas</option><option>Venda</option><option>Aluguer</option><option value="sem">Sem modalidade</option>
              </select>
            </div>
            <button className={buttonVariants({ variant: 'secondary' })}>Filtrar</button>
            {(p.q || p.mod) && <Link href={href({ q: undefined, mod: undefined })} className={buttonVariants({ variant: 'inverse' })}>Limpar</Link>}
          </form>
        </CardContent>
        {items.length === 0 ? (
          <CardContent className="py-8 text-center text-fc-dark-60">Nenhum IMEI em stock para este filtro.</CardContent>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>IMEI</TableHead><TableHead>Equipamento</TableHead><TableHead>Armazém</TableHead>
              <TableHead>Modalidade</TableHead><TableHead>Desde</TableHead><TableHead>Último movimento</TableHead><TableHead>Na Intranet</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {items.map((i) => (
                <TableRow key={i.imei}>
                  <TableCell className="font-mono text-[12px]"><Link href={`/stock?imei=${i.imei}#movimentos`} className="text-fc-light-100 hover:text-fc-light-60">{i.imei}</Link></TableCell>
                  <TableCell>{i.equipment ?? <span className="text-fc-dark-60">{i.hardware ?? '—'}</span>}</TableCell>
                  <TableCell>{i.warehouse}</TableCell>
                  <TableCell>{i.modality ?? '—'}</TableCell>
                  <TableCell>{fmtDate(i.moved_at)}</TableCell>
                  <TableCell className="text-fc-dark-60">{KIND[i.kind] ?? i.kind}</TableCell>
                  <TableCell>
                    {i.installed_plate ? (
                      <span className="flex items-center gap-1 text-[#c7830b]" title="A Intranet mostra este IMEI instalado">
                        <AlertTriangle className="size-3.5" /> {i.installed_plate}{i.installed_client ? ` · ${i.installed_client}` : ''}
                        <RemoveInstalled imei={i.imei} warehouseId={i.warehouse_id} warehouses={warehouses} />
                      </span>
                    ) : <span className="text-fc-dark-40">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {items.length === 500 && <p className="fc-small px-5 py-2 text-fc-dark-60">A mostrar os primeiros 500 — use os filtros.</p>}
      </Card>

      {/* Movimentos */}
      <Card id="movimentos">
        <CardHeader><CardTitle>{p.imei ? `Movimentos do IMEI ${p.imei}` : 'Últimos movimentos'}</CardTitle></CardHeader>
        <CardContent className="pb-3">
          <form className="flex items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="imei">Histórico de um IMEI</Label>
              <Input id="imei" name="imei" defaultValue={p.imei} placeholder="IMEI" className="w-64 font-mono" />
            </div>
            <button className={buttonVariants({ variant: 'secondary' })}>Ver</button>
            {p.imei && <Link href="/stock#movimentos" className={buttonVariants({ variant: 'inverse' })}>Todos</Link>}
          </form>
        </CardContent>
        {movements.length === 0 ? (
          <CardContent className="py-8 text-center text-fc-dark-60">Sem movimentos.</CardContent>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Data</TableHead><TableHead>Tipo</TableHead><TableHead>IMEI</TableHead><TableHead>Equipamento</TableHead>
              <TableHead>De</TableHead><TableHead>Para</TableHead><TableHead>Modalidade</TableHead><TableHead>Origem</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{fmtDate(m.moved_at)}</TableCell>
                  <TableCell>{KIND[m.kind] ?? m.kind}</TableCell>
                  <TableCell className="font-mono text-[12px]">{m.imei}</TableCell>
                  <TableCell>{m.equipment ?? '—'}</TableCell>
                  <TableCell>{m.from_wh ?? '—'}</TableCell>
                  <TableCell>{m.to_wh ?? (m.kind === 'intervencao_saida' || m.kind === 'ajuste' ? 'Instalado' : '—')}</TableCell>
                  <TableCell>{m.modality ?? '—'}</TableCell>
                  <TableCell className="text-fc-dark-60">
                    {m.intervention_id ? (
                      <Link href={`/interventions/${m.intervention_id}`} className="text-fc-light-100 hover:text-fc-light-60">Intervenção</Link>
                    ) : (
                      <span className="flex items-center gap-2">
                        <span className="truncate">{[m.notes, m.created_by].filter(Boolean).join(' · ') || '—'}</span>
                        {isAdmin && <MovementDelete id={m.id} />}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      </>)}
    </div>
  )
}
