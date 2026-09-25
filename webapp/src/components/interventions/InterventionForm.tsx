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
import { createIntervention, updateIntervention } from '@/actions/interventions'
import { AccessoryPicker } from '@/components/interventions/AccessoryPicker'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ImeiField } from '@/components/interventions/ImeiField'
import { PlateField } from '@/components/interventions/PlateField'
import type { ClientOption } from '@/lib/intranet'
import { getPlateImeis, type PlateImeis } from '@/actions/intranet'
import { matchEquipment } from '@/lib/hardware'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

interface Props {
  referenceData: ReferenceData
  /** destinatários do email automático (variável BILLING_EMAIL_TO) */
  billingRecipients: string[]
  /** clientes com o nome da Intranet (ver getClientOptions) */
  clientOptions: ClientOption[]
  /** ao editar: id do registo e valores atuais */
  initial?: { id: string; values: InterventionFormInput; billingNotified: boolean }
}

export function InterventionForm({ referenceData, billingRecipients, clientOptions, initial }: Props) {
  const editing = !!initial
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
    defaultValues: initial?.values ?? {
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
      return_equipment_imei: '',
      accessories_spent: [],
      accessories_returned: [],
    },
  })

  // Kits: ao escolher um equipamento gasto/retomado, acrescenta os acessórios que o acompanham.
  // Ao trocar de equipamento, retira as linhas do kit anterior que não foram alteradas.
  const [kitNote, setKitNote] = useState<{ spent?: string; returned?: string }>({})
  const activeAccessories = new Set((referenceData.accessories ?? []).map((a) => a.id))
  const kitOf = (equipmentId: string) =>
    (referenceData.equipmentKits ?? []).filter((k) => k.equipment_id === equipmentId && activeAccessories.has(k.accessory_id))
  const applyKit = (field: 'accessories_spent' | 'accessories_returned', prevEquipment: string, nextEquipment: string) => {
    const prevKit = prevEquipment ? kitOf(prevEquipment) : []
    const nextKit = nextEquipment ? kitOf(nextEquipment) : []
    let lines = (getValues(field) ?? []).filter(
      (l) => !prevKit.some((k) => k.accessory_id === l.accessory_id && k.quantity === l.quantity)
    )
    const added: string[] = []
    for (const k of nextKit) {
      if (lines.some((l) => l.accessory_id === k.accessory_id)) continue
      lines = [...lines, { accessory_id: k.accessory_id, quantity: k.quantity }]
      added.push(referenceData.accessories?.find((a) => a.id === k.accessory_id)?.name ?? '')
    }
    setValue(field, lines, { shouldDirty: true })
    const eqName = referenceData.equipmentList?.find((e) => e.id === nextEquipment)?.name
    setKitNote((n) => ({ ...n, [field === 'accessories_spent' ? 'spent' : 'returned']: added.length ? `Kit ${eqName}: acrescentado ${added.join(', ')} (pode retirar).` : undefined }))
  }

  // Hardware da Intranet → equipamento da lista (manual em Configurações, ou automático pelo nome)
  const matchEq = (hardware: string | null | undefined) =>
    matchEquipment(hardware, referenceData.equipmentList ?? [], referenceData.hardwareMap ?? [])?.item
  /** Preenche o equipamento gasto/retomado (se vazio) e acrescenta o kit */
  const [hwNote, setHwNote] = useState<Record<string, string | undefined>>({})
  const fillMaterialEquipment = (field: 'spent_equipment_id' | 'return_equipment_id', hardware: string | null | undefined) => {
    if (getValues(field)) return
    const eq = matchEq(hardware)
    setHwNote((n) => ({ ...n, [field]: hardware ? (eq ? `Hardware na Intranet: ${hardware} → ${eq.name}` : `Hardware na Intranet: ${hardware} (sem correspondência na lista — escolha o equipamento; pode definir a correspondência em Configurações › Equipamentos)`) : undefined }))
    if (!eq) return
    applyKit(field === 'spent_equipment_id' ? 'accessories_spent' : 'accessories_returned', '', eq.id)
    setValue(field, eq.id, { shouldDirty: true })
  }

  const selectedClientId = watch('client_id')
  const plate = watch('license_plate')
  const [plateImeis, setPlateImeis] = useState<PlateImeis | null>(null)
  // ao editar, a matrícula já gravada não volta a preencher os IMEIs (só se for alterada)
  const initialPlate = useRef(initial ? (initial.values.license_plate ?? '') : null)

  // Matrícula → IMEI atual (Intranet) para o material gasto e IMEI anterior para o material retomado.
  // Só preenche campos vazios, para não apagar o que o utilizador escreveu.
  useEffect(() => {
    const p = (plate ?? '').replace(/[^A-Za-z0-9]/g, '')
    if (p.length < 6) { setPlateImeis(null); return }
    let cancel = false
    const t = setTimeout(async () => {
      const r = await getPlateImeis(p)
      if (cancel) return
      setPlateImeis(r)
      if (initialPlate.current !== null && initialPlate.current === plate) return
      initialPlate.current = null
      if (r.current && !getValues('spent_equipment_imei')) {
        setValue('spent_equipment_imei', r.current.imei)
        fillMaterialEquipment('spent_equipment_id', r.current.model)
      }
      if (r.previous && !getValues('return_equipment_imei')) {
        setValue('return_equipment_imei', r.previous.imei)
        fillMaterialEquipment('return_equipment_id', r.previous.model)
      }
    }, 400)
    return () => { cancel = true; clearTimeout(t) }
  }, [plate, getValues, setValue])

  const clientHint = clientOptions.find((c) => c.value === selectedClientId)?.hint


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
      const result = initial ? await updateIntervention(initial.id, values) : await createIntervention(values)
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
        <h1>{editing ? 'Editar intervenção' : 'Nova intervenção'}</h1>
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
                  options={clientOptions}
                  value={field.value ?? ''}
                  onChange={(v) => handleClientChange(v, field.onChange)}
                  placeholder="Selecione o cliente (nome na Intranet)"
                />
              )}
            />
            {clientHint && <p className="fc-small text-fc-dark-60">{clientHint}</p>}
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
            <Controller
              name="license_plate"
              control={control}
              render={({ field }) => (
                <PlateField
                  id="license_plate"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  clientId={selectedClientId || undefined}
                  onPick={(d) => {
                    if (!getValues('imei')) setValue('imei', d.imei)
                    const eq = matchEq(d.model)
                    if (eq && !getValues('equipment_id')) setValue('equipment_id', eq.id)
                  }}
                />
              )}
            />
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
                  clientName={clientOptions.find((c) => c.value === selectedClientId)?.label}
                  onPick={(d) => {
                    if (d.license_plate && !getValues('license_plate')) setValue('license_plate', d.license_plate)
                    const eq = matchEq(d.model)
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
                  onChange={(v) => { applyKit('accessories_spent', field.value ?? '', v); field.onChange(v) }}
                  placeholder="Selecione o equipamento"
                />
                )}
              />
              {hwNote.spent_equipment_id && <p className="fc-small text-fc-dark-60">{hwNote.spent_equipment_id}</p>}
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
                      fillMaterialEquipment('spent_equipment_id', d.model)
                    }}
                  />
                )}
              />
              {plateImeis?.current && (
                <p className="fc-small text-fc-dark-60">
                  IMEI atual na Intranet para {plate}: <span className="font-mono">{plateImeis.current.imei}</span>
                  {plateImeis.current.model ? ` · ${plateImeis.current.model}` : ''}
                </p>
              )}
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
            {kitNote.spent && <p className="fc-small text-fc-dark-60">{kitNote.spent}</p>}
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
                  onChange={(v) => { applyKit('accessories_returned', field.value ?? '', v); field.onChange(v) }}
                  placeholder="Selecione o equipamento"
                />
                )}
              />
              {hwNote.return_equipment_id && <p className="fc-small text-fc-dark-60">{hwNote.return_equipment_id}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="return_equipment_imei">IMEI equipamento retomado</Label>
            <Controller
              name="return_equipment_imei"
              control={control}
              render={({ field }) => (
                <ImeiField
                  id="return_equipment_imei"
                  scope="global"
                  retired
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onPick={(d) => {
                    fillMaterialEquipment('return_equipment_id', d.model)
                  }}
                />
              )}
            />
            {plateImeis?.previous ? (
              <p className="fc-small text-fc-dark-60">
                IMEI anterior da matrícula {plate}: <span className="font-mono">{plateImeis.previous.imei}</span> ·{' '}
                {plateImeis.previous.source === 'intranet'
                  ? `substituído na Intranet em ${plateImeis.previous.date?.split('-').reverse().join('/')}`
                  : `registado numa intervenção de ${plateImeis.previous.date?.split('-').reverse().join('/')}`}
              </p>
            ) : plateImeis ? (
              <p className="fc-small text-fc-dark-60">Sem IMEI anterior conhecido para esta matrícula.</p>
            ) : null}
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
            {kitNote.returned && <p className="fc-small text-fc-dark-60">{kitNote.returned}</p>}
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
              <p className="fc-small text-fc-dark-60">
                {initial?.billingNotified
                  ? 'O email à financeira já foi enviado para este registo (não é reenviado ao gravar).'
                  : 'Enviado automaticamente ao gravar com Faturar = Sim.'}
              </p>
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

          <div className="space-y-1.5">
            <Label htmlFor="account_services">Serviços da conta — Driving Behavior / sensor de porta</Label>
            <Input id="account_services" {...register('account_services')} />
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
          {loading ? 'A guardar…' : editing ? 'Guardar alterações' : 'Guardar intervenção'}
        </Button>
      </div>
    </form>
  )
}
