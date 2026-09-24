'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { interventionSchema, type InterventionFormValues, type InterventionFormInput } from '@/lib/schemas/intervention'
import { type ReferenceData } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createIntervention } from '@/actions/interventions'
import { AccessoryPicker } from '@/components/interventions/AccessoryPicker'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ImeiField } from '@/components/interventions/ImeiField'

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  referenceData: ReferenceData
  /** destinatários do email automático (variável BILLING_EMAIL_TO) */
  billingRecipients: string[]
}

export function InterventionForm({ referenceData, billingRecipients }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    control,
    formState: { errors },
  } = useForm<InterventionFormInput, unknown, InterventionFormValues>({
    resolver: zodResolver(interventionSchema),
    defaultValues: {
      intervention_date: new Date().toISOString().split('T')[0],
      technician_id: '',
      client_id: '',
      intervention_type_id: '',
      motive_id: '',
      equipment_id: '',
      stock_exit_warehouse_id: '',
      stock_entry_warehouse_id: '',
      billing: '',
      bundle_id: '',
      platform_id: '',
      validated_by: '',
      spent_equipment_id: '',
      return_equipment_id: '',
      accessories_spent: [],
      accessories_returned: [],
    },
  })

  const selectedClientId = watch('client_id')

  // List of valid names for validators
  const VALID_VALIDATORS = ['TC', 'SP', 'MA', 'HV', 'MS', 'AF']

  // Auto-fill client data
  const handleClientChange = (clientId: string, onChange: (val: string) => void) => {
    onChange(clientId)
    const client = referenceData.clients?.find((c) => c.id === clientId)
    if (client) {
      setValue('venda_aluguer', client.venda_aluguer || '')
      setValue('nos_vdf', client.nos_vdf || '')
      setValue('report_projeto', client.report_projeto_contrato || '')
    }
  }

  const onSubmit = async (values: InterventionFormValues) => {
    setLoading(true)
    try {
      const result = await createIntervention(values)
      if (!result.success) throw new Error(result.error)
      if (result.emailWarning) alert(result.emailWarning)
      router.push(`/interventions/${result.id}`)
      router.refresh()
    } catch (error) {
      alert('Erro ao guardar intervenção: ' + (error as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="mx-auto max-w-5xl space-y-5 px-4 pt-6 pb-20 sm:px-6 lg:px-8">
      <div className="space-y-1">
        <h1>Nova intervenção</h1>
        <p className="fc-small text-fc-dark-60">Os campos assinalados com * são obrigatórios.</p>
      </div>

      {/* Seção 1: Informações Básicas */}
      <Card>
        <CardHeader>
          <CardTitle>Informações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="intervention_date">Data da Intervenção <span className="text-fc-red">*</span></Label>
            <Input
              id="intervention_date"
              type="date"
              {...register('intervention_date')}
            />
            {errors.intervention_date && (
              <p className="fc-small text-fc-danger">{errors.intervention_date.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Técnico <span className="text-fc-red">*</span></Label>
            <Controller
              name="technician_id"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="technician_id"
                  invalid={!!errors.technician_id}
                  options={(referenceData.technicians ?? []).map((t) => ({ value: t.id, label: t.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o técnico"
                />
              )}
            />
            {errors.technician_id && (
              <p className="fc-small text-fc-danger">{errors.technician_id.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Cliente <span className="text-fc-red">*</span></Label>
            <Controller
              name="client_id"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="client_id"
                  invalid={!!errors.client_id}
                  options={(referenceData.clients ?? []).map((c) => ({ value: c.id, label: c.name }))}
                  value={field.value ?? ''}
                  onChange={(v) => handleClientChange(v, field.onChange)}
                  placeholder="Selecione o cliente"
                />
              )}
            />
            {errors.client_id && (
              <p className="fc-small text-fc-danger">{errors.client_id.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de Intervenção <span className="text-fc-red">*</span></Label>
            <Controller
              name="intervention_type_id"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="intervention_type_id"
                  invalid={!!errors.intervention_type_id}
                  options={(referenceData.interventionTypes ?? []).map((t) => ({ value: t.id, label: t.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o tipo"
                />
              )}
            />
            {errors.intervention_type_id && (
              <p className="fc-small text-fc-danger">{errors.intervention_type_id.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seção 2: Detalhes do Cliente (Auto-preenchidos) */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes do Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="venda_aluguer">Venda / Aluguer</Label>
            <Input id="venda_aluguer" {...register('venda_aluguer')} readOnly className="bg-fc-grey-100 text-fc-dark-60" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nos_vdf">NOS / VDF</Label>
            <Input id="nos_vdf" {...register('nos_vdf')} readOnly className="bg-fc-grey-100 text-fc-dark-60" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report_projeto">Report / Projeto</Label>
            <Input id="report_projeto" {...register('report_projeto')} readOnly className="bg-fc-grey-100 text-fc-dark-60" />
          </div>
        </CardContent>
      </Card>

      {/* Seção 3: Veículo e Equipamento */}
      <Card>
        <CardHeader>
          <CardTitle>Identificação e Equipamento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="license_plate">Matrícula</Label>
            <Input id="license_plate" {...register('license_plate')} placeholder="00-AA-00" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="imei">IMEI</Label>
            <Controller
              name="imei"
              control={control}
              render={({ field }) => (
                <ImeiField
                  id="imei"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  clientId={selectedClientId || undefined}
                  clientName={referenceData.clients?.find((c) => c.id === selectedClientId)?.name}
                  onPick={(d) => {
                    if (d.license_plate && !getValues('license_plate')) setValue('license_plate', d.license_plate)
                    const eq = d.model && referenceData.equipmentList?.find((e) => fold(e.name) === fold(d.model!))
                    if (eq && !getValues('equipment_id')) setValue('equipment_id', eq.id)
                  }}
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Equipamento Principal</Label>
            <Controller
              name="equipment_id"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="equipment_id"
                  invalid={!!errors.equipment_id}
                  options={(referenceData.equipmentList ?? []).map((e) => ({ value: e.id, label: e.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o equipamento"
                />
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="warranty_rental">Garantia / Aluguer</Label>
            <Input id="warranty_rental" {...register('warranty_rental')} placeholder="Ex: Garantia (1 ano)" />
          </div>
        </CardContent>
      </Card>

      {/* Seção 4: Motivo e Descrição */}
      <Card>
        <CardHeader>
          <CardTitle>Motivo e Descrição</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            <div className="space-y-1.5">
              <Label>Motivo</Label>
              <Controller
                name="motive_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                  id="motive_id"
                  invalid={!!errors.motive_id}
                  options={(referenceData.motives ?? []).map((m) => ({ value: m.id, label: m.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o motivo"
                />
                )}
              />
              {errors.motive_id && (
                <p className="fc-small text-fc-danger">{errors.motive_id.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="assisted_material">Material Assistido</Label>
              <Input id="assisted_material" {...register('assisted_material')} placeholder="Ex: Antena, Cabo..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="action_description">Ação Efetuada / Descrição Intervenção</Label>
            <Textarea id="action_description" {...register('action_description')} rows={4} />
          </div>
        </CardContent>
      </Card>

      {/* Seção 5: Material Gasto */}
      <Card>
        <CardHeader>
          <CardTitle>Material Gasto (Saída)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="spent_equipment_id">Equipamento gasto</Label>
              <Controller
                name="spent_equipment_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                  id="spent_equipment_id"
                  invalid={!!errors.spent_equipment_id}
                  options={(referenceData.equipmentList ?? []).map((e) => ({ value: e.id, label: e.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o equipamento"
                />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spent_equipment_imei">IMEI equipamento gasto</Label>
              <Controller
                name="spent_equipment_imei"
                control={control}
                render={({ field }) => (
                  <ImeiField
                    id="spent_equipment_imei"
                    scope="global"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onPick={(d) => {
                      const eq = d.model && referenceData.equipmentList?.find((e) => fold(e.name) === fold(d.model!))
                      if (eq && !getValues('spent_equipment_id')) setValue('spent_equipment_id', eq.id)
                    }}
                  />
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accessories_spent">Acessórios gastos</Label>
            <Controller
              name="accessories_spent"
              control={control}
              render={({ field }) => (
                <AccessoryPicker id="accessories_spent" options={referenceData.accessories ?? []} value={field.value ?? []} onChange={field.onChange} />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Armazém de Saída</Label>
            <Controller
              name="stock_exit_warehouse_id"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="stock_exit_warehouse_id"
                  invalid={!!errors.stock_exit_warehouse_id}
                  options={(referenceData.warehouses ?? []).filter((w) => w.type !== 'entrada').map((w) => ({ value: w.id, label: w.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o armazém"
                />
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Seção 6: Material a Dar Entrada */}
      <Card>
        <CardHeader>
          <CardTitle>Material Retomado (Entrada)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="return_equipment_id">Equipamento retomado</Label>
            <Controller
                name="return_equipment_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                  id="return_equipment_id"
                  invalid={!!errors.return_equipment_id}
                  options={(referenceData.equipmentList ?? []).map((e) => ({ value: e.id, label: e.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o equipamento"
                />
                )}
              />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="accessories_returned">Acessórios retomados</Label>
            <Controller
              name="accessories_returned"
              control={control}
              render={({ field }) => (
                <AccessoryPicker id="accessories_returned" options={referenceData.accessories ?? []} value={field.value ?? []} onChange={field.onChange} />
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Armazém de Entrada</Label>
            <Controller
              name="stock_entry_warehouse_id"
              control={control}
              render={({ field }) => (
                <SearchableSelect
                  id="stock_entry_warehouse_id"
                  invalid={!!errors.stock_entry_warehouse_id}
                  options={(referenceData.warehouses ?? []).filter((w) => w.type !== 'saida').map((w) => ({ value: w.id, label: w.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o armazém"
                />
              )}
            />
          </div>
        </CardContent>
      </Card>

      {/* Seção 7: Faturação e Configuração */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card>
          <CardHeader>
            <CardTitle>Faturação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Faturar?</Label>
              <Controller
                name="billing"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                  id="billing"
                  invalid={!!errors.billing}
                  options={(referenceData.billingOptions ?? []).map((o) => ({ value: o.name, label: o.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Sim / Não..."
                />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billing_recipients">Email à financeira</Label>
              <Input id="billing_recipients" value={billingRecipients.join(', ')} readOnly tabIndex={-1} className="bg-fc-grey-100 text-fc-dark-60" />
              <p className="fc-small text-fc-dark-60">Enviado automaticamente ao gravar com Faturar = Sim.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="billing_observations">Observações Faturação</Label>
              <Textarea id="billing_observations" {...register('billing_observations')} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Configuração / Bundle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Bundle</Label>
              <Controller
                name="bundle_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                  id="bundle_id"
                  invalid={!!errors.bundle_id}
                  options={(referenceData.bundles ?? []).map((b) => ({ value: b.id, label: b.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione o bundle"
                />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Plataforma</Label>
              <Controller
                name="platform_id"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                  id="platform_id"
                  invalid={!!errors.platform_id}
                  options={(referenceData.platforms ?? []).map((p) => ({ value: p.id, label: p.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione a plataforma"
                />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="configuration">Configuração</Label>
              <Input id="configuration" {...register('configuration')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dtc_active_realtime">DTC Ativo Real time</Label>
              <Input id="dtc_active_realtime" {...register('dtc_active_realtime')} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Seção 8: Outros e Validação */}
      <Card>
        <CardHeader>
          <CardTitle>Dados Finais e Validação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-5 gap-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="validation_date">Data de Validação</Label>
              <Input id="validation_date" type="date" {...register('validation_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>Validado Por</Label>
              <Controller
                name="validated_by"
                control={control}
                render={({ field }) => (
                  <SearchableSelect
                  id="validated_by"
                  invalid={!!errors.validated_by}
                  options={(referenceData.technicians ?? []).filter((t) => VALID_VALIDATORS.includes(t.name)).map((t) => ({ value: t.id, label: t.name }))}
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Selecione..."
                />
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wow">WOW</Label>
              <Input id="wow" {...register('wow')} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="observations">Observações Gerais</Label>
              <Textarea id="observations" {...register('observations')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="services_status">Serviços Ativo/Desativo</Label>
              <Textarea id="services_status" {...register('services_status')} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="crm_vehicle">Viatura CRM</Label>
              <Input id="crm_vehicle" {...register('crm_vehicle')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contract_addendum">Contrato / Adenda</Label>
              <Input id="contract_addendum" {...register('contract_addendum')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="zoho_form">Formulário Zoho</Label>
              <Input id="zoho_form" {...register('zoho_form')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-fc-dark-20 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button type="button" variant="inverse" size="lg" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? 'A guardar…' : 'Guardar intervenção'}
        </Button>
      </div>
    </form>
  )
}
