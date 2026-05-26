'use client'

import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { interventionSchema, type InterventionFormValues } from '@/lib/schemas/intervention'
import { type ReferenceData } from '@/types/database'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  referenceData: ReferenceData
}

export function InterventionForm({ referenceData }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<InterventionFormValues>({
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
    },
  })

  // List of valid names for validators
  const VALID_VALIDATORS = ['TC', 'SP', 'MA', 'HV', 'MS', 'AF']

  // Auto-fill client data
  const handleClientChange = (clientName: string, onChange: (val: string) => void) => {
    onChange(clientName)
    const client = referenceData.clients?.find((c) => c.name === clientName)
    if (client) {
      setValue('venda_aluguer', client.venda_aluguer || '')
      setValue('nos_vdf', client.nos_vdf || '')
      setValue('report_projeto', client.report_projeto_contrato || '')
    }
  }

  const onSubmit = async (values: InterventionFormValues) => {
    setLoading(true)
    try {
      // Map names back to IDs for the database
      const mappedValues = {
        ...values,
        technician_id: referenceData.technicians?.find(t => t.name === values.technician_id)?.id || null,
        client_id: referenceData.clients?.find(c => c.name === values.client_id)?.id || null,
        intervention_type_id: referenceData.interventionTypes?.find(t => t.name === values.intervention_type_id)?.id || null,
        motive_id: referenceData.motives?.find(m => m.name === values.motive_id)?.id || null,
        equipment_id: referenceData.equipmentList?.find(e => e.name === values.equipment_id)?.id || null,
        stock_exit_warehouse_id: referenceData.warehouses?.find(w => w.name === values.stock_exit_warehouse_id)?.id || null,
        stock_entry_warehouse_id: referenceData.warehouses?.find(w => w.name === values.stock_entry_warehouse_id)?.id || null,
        bundle_id: referenceData.bundles?.find(b => b.name === values.bundle_id)?.id || null,
        platform_id: referenceData.platforms?.find(p => p.name === values.platform_id)?.id || null,
        validated_by: referenceData.technicians?.find(t => t.name === values.validated_by)?.id || null,
        // Ensure optional date strings are handled correctly
        validation_date: values.validation_date || null,
        intervention_date: values.intervention_date || new Date().toISOString().split('T')[0],
      }

      const { error } = await supabase
        .schema('gestao_interv')
        .from('interventions')
        .insert([mappedValues])

      if (error) throw error

      router.push('/interventions')
      router.refresh()
    } catch (error: any) {
      alert('Erro ao salvar intervenção: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 max-w-5xl mx-auto p-4 pb-20">
      <h1 className="text-3xl font-bold">Nova Intervenção</h1>

      {/* Seção 1: Informações Básicas */}
      <Card>
        <CardHeader>
          <CardTitle>Informações Gerais</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="intervention_date">Data da Intervenção</Label>
            <Input
              id="intervention_date"
              type="date"
              {...register('intervention_date')}
            />
            {errors.intervention_date && (
              <p className="text-sm text-red-500">{errors.intervention_date.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Técnico</Label>
            <Controller
              name="technician_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o técnico" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceData.technicians?.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.technician_id && (
              <p className="text-sm text-red-500">{errors.technician_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Cliente</Label>
            <Controller
              name="client_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => handleClientChange(v, field.onChange)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceData.clients?.map((c) => (
                      <SelectItem key={c.id} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.client_id && (
              <p className="text-sm text-red-500">{errors.client_id.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Tipo de Intervenção</Label>
            <Controller
              name="intervention_type_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceData.interventionTypes?.map((t) => (
                      <SelectItem key={t.id} value={t.name}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.intervention_type_id && (
              <p className="text-sm text-red-500">{errors.intervention_type_id.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Seção 2: Detalhes do Cliente (Auto-preenchidos) */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes do Cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="venda_aluguer">Venda / Aluguer</Label>
            <Input id="venda_aluguer" {...register('venda_aluguer')} readOnly className="bg-gray-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nos_vdf">NOS / VDF</Label>
            <Input id="nos_vdf" {...register('nos_vdf')} readOnly className="bg-gray-100" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="report_projeto">Report / Projeto</Label>
            <Input id="report_projeto" {...register('report_projeto')} readOnly className="bg-gray-100" />
          </div>
        </CardContent>
      </Card>

      {/* Seção 3: Veículo e Equipamento */}
      <Card>
        <CardHeader>
          <CardTitle>Identificação e Equipamento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="license_plate">Matrícula</Label>
            <Input id="license_plate" {...register('license_plate')} placeholder="00-AA-00" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imei">IMEI</Label>
            <Input id="imei" {...register('imei')} />
          </div>
          <div className="space-y-2">
            <Label>Equipamento Principal</Label>
            <Controller
              name="equipment_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o equipamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceData.equipmentList?.map((e) => (
                      <SelectItem key={e.id} value={e.name}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-2">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Controller
                name="motive_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o motivo" />
                    </SelectTrigger>
                    <SelectContent>
                      {referenceData.motives?.map((m) => (
                        <SelectItem key={m.id} value={m.name}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.motive_id && (
                <p className="text-sm text-red-500">{errors.motive_id.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="assisted_material">Material Assistido</Label>
              <Input id="assisted_material" {...register('assisted_material')} placeholder="Ex: Antena, Cabo..." />
            </div>
          </div>
          <div className="space-y-2">
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
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="spent_equipment">Equipamento Gasto</Label>
              <Input id="spent_equipment" {...register('spent_equipment')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="spent_equipment_imei">IMEI Equipamento Gasto</Label>
              <Input id="spent_equipment_imei" {...register('spent_equipment_imei')} />
            </div>
          </div>
          
          <div className="space-y-4">
            <Label>Acessórios Gastos</Label>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <Input {...register('accessory_spent_1')} placeholder="Acessório I" />
              <Input {...register('accessory_spent_2')} placeholder="Acessório II" />
              <Input {...register('accessory_spent_3')} placeholder="Acessório III" />
              <Input {...register('accessory_spent_4')} placeholder="Acessório IV" />
              <Input {...register('accessory_spent_5')} placeholder="Acessório V" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Armazém de Saída</Label>
            <Controller
              name="stock_exit_warehouse_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o armazém" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceData.warehouses?.filter(w => w.type !== 'entrada').map((w) => (
                      <SelectItem key={w.id} value={w.name}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="equipment_return">Equipamento a Dar Entrada</Label>
            <Input id="equipment_return" {...register('equipment_return')} />
          </div>
          
          <div className="space-y-4">
            <Label>Acessórios a Dar Entrada</Label>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <Input {...register('accessory_return_1')} placeholder="Acessório I" />
              <Input {...register('accessory_return_2')} placeholder="Acessório II" />
              <Input {...register('accessory_return_3')} placeholder="Acessório III" />
              <Input {...register('accessory_return_4')} placeholder="Acessório IV" />
              <Input {...register('accessory_return_5')} placeholder="Acessório V" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Armazém de Entrada</Label>
            <Controller
              name="stock_entry_warehouse_id"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o armazém" />
                  </SelectTrigger>
                  <SelectContent>
                    {referenceData.warehouses?.filter(w => w.type !== 'saida').map((w) => (
                      <SelectItem key={w.id} value={w.name}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <div className="space-y-2">
              <Label>Faturar?</Label>
              <Controller
                name="billing"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sim / Não..." />
                    </SelectTrigger>
                    <SelectContent>
                      {referenceData.billingOptions?.map((o) => (
                        <SelectItem key={o.id} value={o.name}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="billing_email">Email Faturação</Label>
              <Input id="billing_email" type="email" {...register('billing_email')} />
              {errors.billing_email && (
                <p className="text-sm text-red-500">{errors.billing_email.message}</p>
              )}
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Bundle</Label>
              <Controller
                name="bundle_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione o bundle" />
                    </SelectTrigger>
                    <SelectContent>
                      {referenceData.bundles?.map((b) => (
                        <SelectItem key={b.id} value={b.name}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label>Plataforma</Label>
              <Controller
                name="platform_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione a plataforma" />
                    </SelectTrigger>
                    <SelectContent>
                      {referenceData.platforms?.map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="configuration">Configuração</Label>
              <Input id="configuration" {...register('configuration')} />
            </div>
            <div className="space-y-2">
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
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="validation_date">Data de Validação</Label>
              <Input id="validation_date" type="date" {...register('validation_date')} />
            </div>
            <div className="space-y-2">
              <Label>Validado Por</Label>
              <Controller
                name="validated_by"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {referenceData.technicians
                        ?.filter((t) => VALID_VALIDATORS.includes(t.name))
                        .map((t) => (
                          <SelectItem key={t.id} value={t.name}>
                            {t.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wow">WOW</Label>
              <Input id="wow" {...register('wow')} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="observations">Observações Gerais</Label>
              <Textarea id="observations" {...register('observations')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="services_status">Serviços Ativo/Desativo</Label>
              <Textarea id="services_status" {...register('services_status')} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
            <div className="space-y-2">
              <Label htmlFor="crm_vehicle">Viatura CRM</Label>
              <Input id="crm_vehicle" {...register('crm_vehicle')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contract_addendum">Contrato / Adenda</Label>
              <Input id="contract_addendum" {...register('contract_addendum')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoho_form">Formulário Zoho</Label>
              <Input id="zoho_form" {...register('zoho_form')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'A guardar...' : 'Guardar Intervenção'}
        </Button>
      </div>
    </form>
  )
}
