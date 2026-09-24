import { getInterventionById } from '@/services/database'
import { requireUser } from '@/lib/auth'
import { BillingEmailStatus } from '@/components/interventions/BillingEmailStatus'
import { notFound } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : null)

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="fc-label">{label}</p>
      <p className="text-[13px] text-fc-dark-100">{value || '—'}</p>
    </div>
  )
}

function AccessoryList({ label, items }: { label: string; items: { name: string; quantity: number }[] }) {
  const total = items.reduce((n, i) => n + i.quantity, 0)
  return (
    <div className="space-y-1.5">
      <p className="fc-label">
        {label}
        {items.length > 0 && <span className="normal-case"> · {total} un.</span>}
      </p>
      {items.length === 0 ? (
        <p>—</p>
      ) : (
        <ul className="divide-y divide-fc-dark-10 border border-fc-dark-10">
          {items.map((a) => (
            <li key={a.name} className="flex items-center justify-between px-3 py-1.5 odd:bg-fc-grey-80">
              <span>{a.name}</span>
              <span className="tabular-nums text-fc-dark-60">× {a.quantity}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function InterventionDetailsPage({ params }: Props) {
  const { id } = await params
  const [user, intervention] = await Promise.all([requireUser(), getInterventionById(id)])

  if (!intervention) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/interventions" className={buttonVariants({ variant: 'inverse', size: 'icon' })} aria-label="Voltar">
            <ArrowLeft />
          </Link>
          <div>
            <h1>Detalhes da intervenção</h1>
            <p className="fc-small text-fc-dark-60">
              {intervention.created_by ? `Registado por ${intervention.created_by}` : intervention.legacy_layout ? 'Importado da Google Sheet' : null}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Informação Geral</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <DetailItem label="Cliente" value={intervention.client?.name} />
              <DetailItem label="Técnico" value={intervention.technician?.name} />
              <DetailItem label="Data da Intervenção" value={fmtDate(intervention.intervention_date)} />
              <DetailItem label="Tipo de Intervenção" value={intervention.intervention_type?.name} />
              <DetailItem label="Matrícula" value={intervention.license_plate} />
              <DetailItem label="IMEI" value={intervention.imei} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Motivo e Descrição</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <DetailItem label="Motivo" value={intervention.motive?.name ?? intervention.motive_text} />
                <DetailItem label="Material Assistido" value={intervention.assisted_material} />
              </div>
              <Separator />
              <DetailItem label="Ação Efetuada / Descrição" value={intervention.action_description} />
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Card>
              <CardHeader>
                <CardTitle>Material Gasto (Saída)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailItem label="Equipamento" value={intervention.spent_equipment_name ?? intervention.spent_equipment} />
                <DetailItem label="IMEI Equipamento" value={intervention.spent_equipment_imei} />
                <Separator />
                <AccessoryList label="Acessórios gastos" items={intervention.accessories_spent} />
                <Separator />
                <DetailItem label="Armazém de Saída" value={intervention.stock_exit_warehouse?.name} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Material Retomado (Entrada)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailItem label="Equipamento" value={intervention.return_equipment_name ?? intervention.equipment_return} />
                <DetailItem label="IMEI Equipamento" value={intervention.return_equipment_imei} />
                <Separator />
                <AccessoryList label="Acessórios retomados" items={intervention.accessories_returned} />
                <Separator />
                <DetailItem label="Armazém de Entrada" value={intervention.stock_entry_warehouse?.name} />
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Coluna Lateral */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Status e Validação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <DetailItem label="Data de Validação" value={fmtDate(intervention.validation_date)} />
              <DetailItem label="Validado Por" value={intervention.validated_by_tech?.name} />
              <DetailItem label="Serviços" value={intervention.services_status} />
              <DetailItem label="WOW" value={intervention.wow} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Faturação</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <DetailItem label="Faturar?" value={intervention.billing} />
              {intervention.billing_email && <DetailItem label="Email de faturação (histórico)" value={intervention.billing_email} />}
              <DetailItem label="Observações de Faturação" value={intervention.billing_observations} />
              <Separator />
              <BillingEmailStatus
                id={intervention.id}
                notifiedAt={intervention.billing_notified_at}
                notifiedBy={intervention.billing_notified_by}
                error={intervention.billing_notify_error}
                canSend={user.role === 'admin'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configuração Técnica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <DetailItem label="Bundle" value={intervention.bundle?.name} />
              <DetailItem label="Plataforma" value={intervention.platform?.name} />
              <DetailItem label="Configuração" value={intervention.configuration} />
              <DetailItem label="DTC Ativo Real Time" value={intervention.dtc_active_realtime} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CRM e Documentos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <DetailItem label="Viatura CRM" value={intervention.crm_vehicle} />
              <DetailItem label="Contrato / Adenda" value={intervention.contract_addendum} />
              <DetailItem label="Formulário Zoho" value={intervention.zoho_form} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
