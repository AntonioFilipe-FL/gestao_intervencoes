import { getInterventionById } from '@/services/database'
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

interface Props {
  params: Promise<{ id: string }>
}

export default async function InterventionDetailsPage({ params }: Props) {
  const { id } = await params
  const intervention = await getInterventionById(id)

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
                <DetailItem label="Equipamento" value={intervention.spent_equipment} />
                <DetailItem label="IMEI Equipamento" value={intervention.spent_equipment_imei} />
                <Separator />
                <div className="space-y-2">
                  <p className="fc-label">Acessórios Gastos</p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {intervention.accessory_spent_1 && <li>{intervention.accessory_spent_1}</li>}
                    {intervention.accessory_spent_2 && <li>{intervention.accessory_spent_2}</li>}
                    {intervention.accessory_spent_3 && <li>{intervention.accessory_spent_3}</li>}
                    {intervention.accessory_spent_4 && <li>{intervention.accessory_spent_4}</li>}
                    {intervention.accessory_spent_5 && <li>{intervention.accessory_spent_5}</li>}
                  </ul>
                </div>
                <Separator />
                <DetailItem label="Armazém de Saída" value={intervention.stock_exit_warehouse?.name} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Material Retomado (Entrada)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <DetailItem label="Equipamento" value={intervention.equipment_return} />
                <Separator />
                <div className="space-y-2">
                  <p className="fc-label">Acessórios Retomados</p>
                  <ul className="list-disc space-y-0.5 pl-5">
                    {intervention.accessory_return_1 && <li>{intervention.accessory_return_1}</li>}
                    {intervention.accessory_return_2 && <li>{intervention.accessory_return_2}</li>}
                    {intervention.accessory_return_3 && <li>{intervention.accessory_return_3}</li>}
                    {intervention.accessory_return_4 && <li>{intervention.accessory_return_4}</li>}
                    {intervention.accessory_return_5 && <li>{intervention.accessory_return_5}</li>}
                  </ul>
                </div>
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
              <DetailItem label="Email de Faturação" value={intervention.billing_email} />
              <DetailItem label="Observações de Faturação" value={intervention.billing_observations} />
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
