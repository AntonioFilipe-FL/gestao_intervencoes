import * as z from 'zod'

/** Selects devolvem o id (uuid) ou '' quando nada está escolhido */
const requiredId = (msg: string) => z.uuid(msg)
const optionalId = z.union([z.uuid(), z.literal('')]).optional()
const text = z.string().trim().max(2000).optional()

/** Uma linha de acessório: qual e quantos */
export const accessoryLine = z.object({
  accessory_id: z.uuid(),
  quantity: z.number().int().min(1, 'Quantidade mínima 1').max(99),
})
export type AccessoryLine = z.infer<typeof accessoryLine>

export const interventionSchema = z.object({
  // Datas
  intervention_date: z.iso.date('Data da intervenção é obrigatória'),
  validation_date: z.union([z.iso.date(), z.literal('')]).optional(),

  // Quem / onde
  technician_id: requiredId('Selecione um técnico'),
  client_id: requiredId('Selecione um cliente'),
  venda_aluguer: text,
  nos_vdf: text,
  report_projeto: text,
  intervention_type_id: requiredId('Selecione o tipo de intervenção'),

  // Identificação viatura / equipamento
  license_plate: text,
  imei: z.union([z.string().trim().regex(/^\d{15}$/, 'O IMEI deve ter 15 dígitos'), z.literal('')]).optional(),
  equipment_id: optionalId,
  warranty_rental: text,

  // Intranet
  intranet_account: text,
  intranet_license_plate: text,

  // Motivo e descrição (motivo só é obrigatório em assistências — ver refine abaixo)
  motive_id: optionalId,
  action_description: text,
  assisted_material: text,

  // Material gasto (saída) — equipamento da lista de Equipamentos, acessórios da lista de Acessórios
  spent_equipment_id: optionalId,
  spent_equipment_imei: text,
  accessories_spent: z.array(accessoryLine).max(50).default([]),

  // Material retomado (entrada)
  return_equipment_id: optionalId,
  accessories_returned: z.array(accessoryLine).max(50).default([]),

  // Faturação
  billing: text,
  billing_observations: text,

  // Configuração
  bundle_id: optionalId,
  dtc_active_realtime: text,
  configuration: text,
  platform_id: optionalId,

  // Outros
  observations: text,
  wow: text,
  services_status: text,

  // Validação
  validated_by: optionalId,

  // CRM / documentos
  crm_vehicle: text,
  contract_addendum: text,
  zoho_form: text,

  // Armazéns
  stock_exit_warehouse_id: optionalId,
  stock_entry_warehouse_id: optionalId,
})

export type InterventionFormValues = z.infer<typeof interventionSchema>

export type InterventionFormInput = z.input<typeof interventionSchema>

/** Converte '' em null para gravar na BD (as listas de acessórios são gravadas à parte) */
export function toDbValues(values: InterventionFormValues) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessories_spent, accessories_returned, ...rest } = values
  return Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v ?? null])
  ) as Record<keyof typeof rest, string | null>
}
