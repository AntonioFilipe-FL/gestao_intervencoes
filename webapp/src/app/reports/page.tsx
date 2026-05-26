import { createClient } from '@/utils/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Users, 
  Wrench, 
  ClipboardCheck, 
  Building2 
} from 'lucide-react'

export default async function ReportsPage() {
  const supabase = await createClient()

  // 1. Estatísticas Rápidas
  const [
    { count: totalInterventions },
    { count: totalTechnicians },
    { count: totalClients },
    { data: recentTrends }
  ] = await Promise.all([
    supabase.schema('gestao_interv').from('interventions').select('*', { count: 'exact', head: true }),
    supabase.schema('gestao_interv').from('technicians').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.schema('gestao_interv').from('clients').select('*', { count: 'exact', head: true }).eq('active', true),
    supabase.schema('gestao_interv').from('interventions').select('intervention_date').order('intervention_date', { ascending: false }).limit(1000)
  ])

  // 2. Processar tendências para gráfico (simplificado por agora)
  const interventionsByMonth: Record<string, number> = {}
  recentTrends?.forEach(row => {
    const month = new Date(row.intervention_date).toLocaleString('pt-PT', { month: 'short', year: '2-digit' })
    interventionsByMonth[month] = (interventionsByMonth[month] || 0) + 1
  })

  const StatsCard = ({ title, value, icon: Icon, description }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value?.toLocaleString()}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Relatórios e Estatísticas</h1>
        <p className="text-muted-foreground">Visão geral da operação e métricas de desempenho.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard 
          title="Total Intervenções" 
          value={totalInterventions} 
          icon={ClipboardCheck} 
          description="Total histórico registado"
        />
        <StatsCard 
          title="Técnicos Ativos" 
          value={totalTechnicians} 
          icon={Wrench} 
          description="Disponíveis para trabalho"
        />
        <StatsCard 
          title="Clientes Ativos" 
          value={totalClients} 
          icon={Users} 
          description="Na base de dados"
        />
        <StatsCard 
          title="Média Mensal" 
          value={Math.round((totalInterventions || 0) / 48)} // Aproximadamente 4 anos de dados
          icon={Building2} 
          description="Intervenções por mês"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Tendência Recente</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(interventionsByMonth).slice(0, 6).map(([month, count]) => (
                <div key={month} className="flex items-center gap-4">
                  <div className="w-16 text-sm font-medium">{month}</div>
                  <div className="flex-1 h-4 bg-blue-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-600" 
                      style={{ width: `${Math.min((count / 500) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="w-12 text-sm text-right font-mono">{count}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-6 text-center">
              Mostrando os últimos 6 meses com base na amostra de dados.
            </p>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Operações por Técnico</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center p-12">
            <p className="text-muted-foreground italic text-center">
              Os técnicos mais ativos aparecem no dashboard principal com filtros.
              Em breve: Gráfico de produtividade por equipa.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
