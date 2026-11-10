import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { getPendingDrafts } from '@/actions/drafts'
import { creatorConfigured } from '@/lib/creator-import'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { buttonVariants } from '@/components/ui/button'
import { DismissDraft, ImportDraftsButton } from '@/components/interventions/DraftActions'

const fmtDate = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

/** Intervenções por confirmar: formulários do Zoho Creator importados, à espera de revisão (só admin / super admin) */
export default async function DraftsPage() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/interventions')
  const rows = await getPendingDrafts()
  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="Intervenções por confirmar"
        subtitle="Formulários “Por validar” do Zoho Creator, já preenchidos. Só passam a intervenção (e só mexem no stock) depois de rever e gravar."
        actions={<>
          {creatorConfigured() ? <ImportDraftsButton /> : <span className="fc-small text-[#b31d25]">Falta configurar o acesso ao Creator (ZOHO_CREATOR_REFRESH_TOKEN).</span>}
          <Link href="/interventions" className={buttonVariants({ variant: 'inverse' })}>Voltar às intervenções</Link>
        </>}
      />
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead><TableHead>Formulário</TableHead><TableHead>Cliente</TableHead><TableHead>Matrícula</TableHead>
                <TableHead>IMEI</TableHead><TableHead>Técnico</TableHead><TableHead>Ticket</TableHead><TableHead>Importado</TableHead><TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-8 text-center text-fc-dark-60">Não há intervenções por confirmar.</TableCell></TableRow>
              ) : rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap font-bold">{fmtDate(r.intervention_date)}</TableCell>
                  <TableCell>{r.form_type ?? '—'}</TableCell>
                  <TableCell>{r.client_name ?? '—'}</TableCell>
                  <TableCell className="font-mono">{r.license_plate ?? '—'}</TableCell>
                  <TableCell className="font-mono">{r.imei ?? '—'}</TableCell>
                  <TableCell>{r.technician_name ?? '—'}</TableCell>
                  <TableCell>{r.ticket ?? '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-fc-dark-60">{fmtDate(r.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-3">
                      <DismissDraft id={r.id} />
                      <Link href={`/interventions/new?draft=${r.id}`} className={buttonVariants({ size: 'sm' })}>Rever e gravar</Link>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
