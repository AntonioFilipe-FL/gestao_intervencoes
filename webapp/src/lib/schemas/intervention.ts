import * as z from 'zod'

export const interventionSchema = z.object({
  // Datas
  intervention_date: z.string().min(1, 'Data da intervenção é obrigatória'),
  validation_date: z.string().optional(),

  // Técnico
  technician_id: z.string().uuid('Selecione um técnico'),

  // Cliente
  client_id: z.string().uuid('Selecione um cliente'),
  venda_aluguer: z.string().optional(),
  nos_vdf: z.string().optional(),
  report_projeto: z.string().optional(),

  // Tipo de Intervenção
  intervention_type_id: z.string().uuid('Selecione o tipo de intervenção'),

  // Identificação Viatura / Equipamento
  license_plate: z.string().optional(),
  imei: z.string().optional(),

  // Equipamento Principal
  equipment_id: z.string().uuid().optional().nullable(),
  warranty_rental: z.string().optional(),

  // Intranet
  intranet_account: z.string().optional(),
  intranet_license_plate: z.string().optional(),

  // Motivo e Descrição
  motive_id: z.string().uuid('Selecione o motivo'),
  action_description: z.string().optional(),
  assisted_material: z.string().optional(),

  // Equipamento Gasto
  spent_equipment: z.string().optional(),
  spent_equipment_imei: z.string().optional(),

  // Acessórios Gastos
  accessory_spent_1: z.string().optional(),
  accessory_spent_2: z.string().optional(),
  accessory_spent_3: z.string().optional(),
  accessory_spent_4: z.string().optional(),
  accessory_spent_5: z.string().optional(),

  // Equipamento a Dar Entrada
  equipment_return: z.string().optional(),

  // Acessórios a Dar Entrada
  accessory_return_1: z.string().optional(),
  accessory_return_2: z.string().optional(),
  accessory_return_3: z.string().optional(),
  accessory_return_4: z.string().optional(),
  accessory_return_5: z.string().optional(),

  // Faturação
  billing: z.string().optional(),
  billing_observations: z.string().optional(),
  billing_email: z.string().email('E-mail inválido').optional().or(z.literal('')),

  // Configuração / Bundle
  bundle_id: z.string().uuid().optional().nullable(),
  dtc_active_realtime: z.string().optional(),
  configuration: z.string().optional(),
  platform_id: z.string().uuid().optional().nullable(),

  // Outros
  observations: z.string().optional(),
  wow: z.string().optional(),
  services_status: z.string().optional(),

  // Validação
  validated_by: z.string().uuid().optional().nullable(),

  // CRM / Documentos
  crm_vehicle: z.string().optional(),
  contract_addendum: z.string().optional(),
  zoho_form: z.string().optional(),

  // Armazéns
  stock_exit_warehouse_id: z.string().uuid().optional().nullable(),
  stock_entry_warehouse_id: z.string().uuid().optional().nullable(),
})

export type InterventionFormValues = z.infer<typeof interventionSchema>
