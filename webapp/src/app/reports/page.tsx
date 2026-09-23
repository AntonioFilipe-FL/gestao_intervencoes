import { getStats } from '@/services/database'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value?.toLocaleString('pt-PT')}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

export default async function ReportsPage() {
  const { totals, byMonth, byTech } = await getStats()
  const maxMonth = Math.max(1, ...byMonth.map(r => r.count))
  const maxTech = Math.max(1, ...byTech.map(r => r.count))


  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Relatórios e Estatísticas</h1>
        <p className="text-muted-foreground">Visão geral da operação e métricas de desempenho.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Intervenções por mês (últimos 12 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {byMonth.map(({ month, count }) => (
                <div key={month} className="flex items-center gap-4">
                  <div className="w-16 text-sm font-medium capitalize">{monthLabel(month)}</div>
                  <div className="flex-1 h-4 bg-red-50 rounded-full overflow-hidden">
                    <div className="h-full bg-[#cf0a2c]" style={{ width: `${(count / maxMonth) * 100}%` }} />
                  </div>
                  <div className="w-12 text-sm text-right font-mono">{count}</div>
                </div>
              ))}
              {byMonth.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
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
                  <div className="w-24 text-sm font-medium truncate">{name}</div>
                  <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gray-700" style={{ width: `${(count / maxTech) * 100}%` }} />
                  </div>
                  <div className="w-12 text-sm text-right font-mono">{count}</div>
                </div>
              ))}
              {byTech.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
