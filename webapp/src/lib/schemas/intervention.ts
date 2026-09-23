import * as z from 'zod'

/** Selects devolvem o id (uuid) ou '' quando nada está escolhido */
const requiredId = (msg: string) => z.uuid(msg)
const optionalId = z.union([z.uuid(), z.literal('')]).optional()
const text = z.string().trim().max(2000).optional()

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

  // Equipamento / acessórios gastos
  spent_equipment: text,
  spent_equipment_imei: text,
  accessory_spent_1: text,
  accessory_spent_2: text,
  accessory_spent_3: text,
  accessory_spent_4: text,
  accessory_spent_5: text,

  // Entrada de material
  equipment_return: text,
  accessory_return_1: text,
  accessory_return_2: text,
  accessory_return_3: text,
  accessory_return_4: text,
  accessory_return_5: text,

  // Faturação
  billing: text,
  billing_observations: text,
  billing_email: text,

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

/** Converte '' em null para gravar na BD */
export function toDbValues(values: InterventionFormValues) {
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v ?? null])
  ) as Record<keyof InterventionFormValues, string | null>
}
