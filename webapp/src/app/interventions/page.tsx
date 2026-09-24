import Link from 'next/link'
import { getInterventions } from '@/services/database'
import { getCurrentUser } from '@/lib/auth'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageHeader } from '@/components/page-header'
import { Pagination } from '@/components/pagination'

const PAGE_SIZE = 25

interface Props {
  searchParams: Promise<{ page?: string; client?: string; tech?: string; plate?: string }>
}

const fmtDate = (d: string) => d.split('-').reverse().join('/')

export default async function InterventionsPage({ searchParams }: Props) {
  const params = await searchParams
  const currentPage = Math.max(1, Number(params.page) || 1)
  const clientSearch = params.client || ''
  const techSearch = params.tech || ''
  const plateSearch = params.plate || ''

  const [user, { interventions, totalPages, count, error }] = await Promise.all([
    getCurrentUser(),
    getInterventions({ page: currentPage, pageSize: PAGE_SIZE, clientSearch, techSearch, plateSearch }),
  ])

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-8">
        <div className="bg-fc-danger/20 px-4 py-3 text-[#b31d25]">Erro ao carregar intervenções: {error.message}</div>
      </div>
    )
  }

  const hasFilters = clientSearch || techSearch || plateSearch
  const pageHref = (p: number) =>
    `/interventions?${new URLSearchParams({ page: String(p), client: clientSearch, tech: techSearch, plate: plateSearch })}`
  const from = count === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1
  const to = Math.min(currentPage * PAGE_SIZE, count)

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Intervenções"
        subtitle={`${count.toLocaleString('pt-PT')} registos${hasFilters ? ' encontrados' : ''}`}
        actions={
          user?.role === 'admin' && (
            <Link href="/interventions/new" className={buttonVariants({ size: 'lg' })}>
              Nova intervenção
            </Link>
          )
        }
      />

      {/* Filtros */}
      <Card>
        <CardContent className="py-4">
          <form className="grid grid-cols-1 items-end gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="client">Cliente</Label>
              <Input id="client" name="client" placeholder="Nome do cliente" defaultValue={clientSearch} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tech">Técnico</Label>
              <Input id="tech" name="tech" placeholder="Iniciais do técnico" defaultValue={techSearch} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plate">Matrícula / IMEI</Label>
              <Input id="plate" name="plate" placeholder="Matrícula ou IMEI" defaultValue={plateSearch} />
            </div>
            <div className="flex gap-2">
              <button type="submit" className={buttonVariants({ variant: 'secondary' })}>Filtrar</button>
              {hasFilters && (
                <Link href="/interventions" className={buttonVariants({ variant: 'inverse' })}>Limpar</Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Resultados */}
      <Card>
        <CardHeader>
          <CardTitle>Registos</CardTitle>
        </CardHeader>
        {interventions.length === 0 ? (
          <CardContent className="py-12 text-center text-fc-dark-60">
            Nenhuma intervenção encontrada para a pesquisa atual.
          </CardContent>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Matrícula</TableHead>
                <TableHead>Técnico</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Descrição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {interventions.map((i) => (
                <TableRow key={i.id} className="cursor-pointer">
                  <TableCell className="p-0">
                    <Link href={`/interventions/${i.id}`} className="flex h-10 items-center px-4">
                      {fmtDate(i.intervention_date)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-56 truncate">
                    <Link href={`/interventions/${i.id}`} className="text-fc-light-100 hover:text-fc-light-60">
                      {i.client?.name ?? '—'}
                    </Link>
                  </TableCell>
                  <TableCell className="font-mono text-[12px]">{i.license_plate ?? '—'}</TableCell>
                  <TableCell>{i.technician?.name ?? '—'}</TableCell>
                  <TableCell>
                    {i.intervention_type?.name ? (
                      <Badge variant={i.intervention_type.name.startsWith('Instala') ? 'info' : 'secondary'}>
                        {i.intervention_type.name}
                      </Badge>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="max-w-80 truncate text-fc-dark-60">
                    {i.action_description ?? i.motive_text ?? ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {count > 0 && (
          <div className="flex flex-col items-center justify-between gap-3 border-t border-fc-dark-10 px-5 py-3 md:flex-row">
            <span className="fc-small text-fc-dark-60">
              A mostrar {from.toLocaleString('pt-PT')} a {to.toLocaleString('pt-PT')} de {count.toLocaleString('pt-PT')} registos
            </span>
            <Pagination current={currentPage} total={totalPages} href={pageHref} />
          </div>
        )}
      </Card>
    </div>
  )
}
