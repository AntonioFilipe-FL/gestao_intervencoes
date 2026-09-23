import { getInterventions } from '@/services/database'
import { Button, buttonVariants } from '@/components/ui/button'
import { getCurrentUser } from '@/lib/auth'
import Link from 'next/link'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface Props {
  searchParams: Promise<{
    page?: string
    client?: string
    tech?: string
    plate?: string
  }>
}

export default async function InterventionsPage({ searchParams }: Props) {
  const params = await searchParams
  const currentPage = Number(params.page) || 1
  const clientSearch = params.client || ''
  const techSearch = params.tech || ''
  const plateSearch = params.plate || ''
  
  const { interventions, totalPages, count, error } = await getInterventions({
    page: currentPage,
    pageSize: 20,
    clientSearch,
    techSearch,
    plateSearch,
  })

  if (error) {
    return <div className="p-8 text-red-500">Erro ao carregar intervenções: {error.message}</div>
  }

  const hasFilters = clientSearch || techSearch || plateSearch
  const user = await getCurrentUser()
  const pageHref = (p: number) =>
    `/interventions?${new URLSearchParams({ page: String(p), client: clientSearch, tech: techSearch, plate: plateSearch })}`

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Intervenções</h1>
          <p className="text-muted-foreground">Total de {count.toLocaleString('pt-PT')} registos</p>
        </div>
        {user?.role === 'admin' && (
          <Link href="/interventions/new" className={buttonVariants({ size: 'lg' })}>
            Nova Intervenção
          </Link>
        )}
      </div>

      <Card>
        <CardContent className="pt-6">
          <form className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase">Cliente</label>
              <Input name="client" placeholder="Nome do cliente..." defaultValue={clientSearch} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase">Técnico</label>
              <Input name="tech" placeholder="Nome do técnico..." defaultValue={techSearch} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700 uppercase">Matrícula / IMEI</label>
              <Input name="plate" placeholder="Matrícula ou IMEI..." defaultValue={plateSearch} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="secondary" size="sm" className="px-6 h-9 font-bold">Filtrar</Button>
              {hasFilters && (
                <Link href="/interventions" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'h-9' })}>Limpar</Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {interventions?.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center text-gray-500">
              Nenhuma intervenção encontrada para a pesquisa atual.
            </CardContent>
          </Card>
        ) : (
          interventions?.map((interv) => (
            <Link key={interv.id} href={`/interventions/${interv.id}`}>
              <Card className="hover:border-blue-300 transition-colors cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <CardTitle className="text-xl">
                        {interv.client?.name || 'Cliente Desconhecido'}
                      </CardTitle>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-800">
                          {interv.license_plate || '---'}
                        </span>
                        <span>•</span>
                        <span>{interv.intervention_date.split('-').reverse().join('/')}</span>
                        <span>•</span>
                        <span>{interv.technician?.name}</span>
                      </div>
                    </div>
                    <Badge variant={interv.intervention_type?.name === 'Instalação' ? 'default' : 'secondary'}>
                      {interv.intervention_type?.name}
                    </Badge>
                  </div>
                </CardHeader>
                {(interv.action_description || interv.motive_text) && (
                  <CardContent>
                    <p className="text-sm text-gray-600 line-clamp-2 italic">
                      &ldquo;{interv.action_description ?? interv.motive_text}&rdquo;
                    </p>
                  </CardContent>
                )}
              </Card>
            </Link>
          ))
        )}
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 py-8">
          <Link
            href={pageHref(currentPage - 1)}
            aria-disabled={currentPage <= 1}
            className={buttonVariants({ variant: 'outline', className: currentPage <= 1 ? 'pointer-events-none opacity-50' : '' })}
          >
            Anterior
          </Link>
          <span className="text-sm font-medium">
            Página {currentPage} de {totalPages}
          </span>
          <Link
            href={pageHref(currentPage + 1)}
            aria-disabled={currentPage >= totalPages}
            className={buttonVariants({ variant: 'outline', className: currentPage >= totalPages ? 'pointer-events-none opacity-50' : '' })}
          >
            Próxima
          </Link>
        </div>
      )}
    </div>
  )
}
