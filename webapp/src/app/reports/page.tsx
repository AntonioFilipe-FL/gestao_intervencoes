import Link from 'next/link'
import { getStats, REPORT_TYPES } from '@/services/database'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StackedByType } from '@/components/reports/StackedByType'
import {
  Users,
  Wrench,
  ClipboardCheck,
  Building2
} from 'lucide-react'

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('pt-PT', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

type StatsCardProps = { title: string; value: number; icon: React.ComponentType<{ className?: string }>; description: string }

function StatsCard({ title, value, icon: Icon, description }: StatsCardProps) {
  return (
    <Card>
      <CardHeader className="grid-cols-[1fr_auto]">
        <CardTitle>{title}</CardTitle>
        <Icon className="size-4 text-fc-dark-40" />
      </CardHeader>
      <CardContent>
        <div className="text-[28px] leading-9 font-light text-fc-dark-100">{value?.toLocaleString('pt-PT')}</div>
        <p className="fc-small text-fc-dark-60">{description}</p>
      </CardContent>
    </Card>
  )
}

interface Props {
  searchParams: Promise<{ etipo?: string; ctipo?: string }>
}

export default async function ReportsPage({ searchParams }: Props) {
  const p = await searchParams
  const valid = (t?: string) => (t && REPORT_TYPES.some((r) => r.toLowerCase() === t.toLowerCase()) ? t : undefined)
  const etipo = valid(p.etipo), ctipo = valid(p.ctipo)
  const { totals, byMonth, byTech, byEquipment, byClient, byMonthType } = await getStats({ equipmentType: etipo, clientType: ctipo })
  const href = (q: { etipo?: string; ctipo?: string }) => {
    const s = new URLSearchParams(Object.entries({ etipo, ctipo, ...q }).filter(([, v]) => v) as [string, string][])
    return `/reports${s.size ? `?${s}` : ''}#${'etipo' in q ? 'por-equipamento' : 'por-cliente'}`
  }
  const TypeFilter = ({ k, current }: { k: 'etipo' | 'ctipo'; current?: string }) => (
    <div className="flex flex-wrap gap-1.5">
      {[undefined, ...REPORT_TYPES].map((t) => (
        <Link
          key={t ?? 'todos'}
          href={href({ [k]: t })}
          scroll={false}
          className={cn(
            'rounded-[2px] border px-2 py-0.5 text-[11px] uppercase',
            (current ?? '').toLowerCase() === (t ?? '').toLowerCase()
              ? 'border-fc-dark-100 bg-fc-dark-100 text-white'
              : 'border-fc-dark-20 text-fc-dark-60 hover:border-fc-dark-60'
          )}
        >
          {t ?? 'Todos os tipos'}
        </Link>
      ))}
    </div>
  )
  const maxMonth = Math.max(1, ...byMonth.map(r => r.count))
  const maxTech = Math.max(1, ...byTech.map(r => r.count))


  return (
    <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1>Relatórios e estatísticas</h1>
        <p className="fc-small text-fc-dark-60">Visão geral da operação e métricas de desempenho. Contam só intervenções técnicas: Assistência, Desinstalação, Instalação (incl. Try and Buy), Reinstalação, Troca de Viatura e Upgrade.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <StatsCard 
          title="Total Intervenções" 
          value={totals.interventions} 
          icon={ClipboardCheck} 
          description="Total histórico registado"
        />
        <StatsCard 
          title="Técnicos Ativos" 
          value={totals.technicians} 
          icon={Wrench} 
          description="Disponíveis para trabalho"
        />
        <StatsCard 
          title="Clientes Ativos" 
          value={totals.clients} 
          icon={Users} 
          description="Na base de dados"
        />
        <StatsCard 
          title="Média Mensal" 
          value={totals.months ? Math.round(totals.interventions / totals.months) : 0}
          icon={Building2} 
          description="Intervenções por mês"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Intervenções por mês (últimos 12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byMonth.map(({ month, count }) => (
                <div key={month} className="flex items-center gap-4">
                  <div className="w-14 text-[12px] text-fc-dark-60 capitalize">{monthLabel(month)}</div>
                  <div className="h-3 flex-1 overflow-hidden bg-fc-grey-100">
                    <div className="h-full bg-fc-light-100" style={{ width: `${(count / maxMonth) * 100}%` }} />
                  </div>
                  <div className="w-12 text-right text-[12px] tabular-nums">{count}</div>
                </div>
              ))}
              {byMonth.length === 0 && <p className="text-fc-dark-60">Sem dados.</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Intervenções por técnico (últimos 90 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byTech.map(({ name, count }) => (
                <div key={name} className="flex items-center gap-4">
                  <div className="w-24 truncate text-[12px] text-fc-dark-60">{name}</div>
                  <div className="h-3 flex-1 overflow-hidden bg-fc-grey-100">
                    <div className="h-full bg-fc-dark-80" style={{ width: `${(count / maxTech) * 100}%` }} />
                  </div>
                  <div className="w-12 text-right text-[12px] tabular-nums">{count}</div>
                </div>
              ))}
              {byTech.length === 0 && <p className="text-fc-dark-60">Sem dados.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Intervenções por tipo e mês (últimos 12 meses)</CardTitle></CardHeader>
        <CardContent><StackedByType rows={byMonthType} keepOrder label={monthLabel} table /></CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card id="por-equipamento">
          <CardHeader><CardTitle>Intervenções por equipamento (top 15, últimos 12 meses){etipo ? ` · ${etipo}` : ''}</CardTitle></CardHeader>
          <CardContent className="space-y-4"><TypeFilter k="etipo" current={etipo} /><StackedByType rows={byEquipment} /></CardContent>
        </Card>
        <Card id="por-cliente">
          <CardHeader><CardTitle>Intervenções por cliente (top 15, últimos 12 meses){ctipo ? ` · ${ctipo}` : ''}</CardTitle></CardHeader>
          <CardContent className="space-y-4"><TypeFilter k="ctipo" current={ctipo} /><StackedByType rows={byClient} /></CardContent>
        </Card>
      </div>
    </div>
  )
}
