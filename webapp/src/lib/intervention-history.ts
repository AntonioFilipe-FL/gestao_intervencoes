import 'server-only'
import type { TransactionSql } from 'postgres'

export type Change = { field: string; label: string; old: string; new: string }

const LABELS: Record<string, string> = {
  intervention_date: 'Data da intervenção', technician_id: 'Técnico', client_id: 'Cliente', venda_aluguer: 'Venda/Aluguer', nos_vdf: 'NOS/VDF',
  report_projeto: 'Report/Projeto', intervention_type_id: 'Tipo de intervenção', license_plate: 'Matrícula', imei: 'IMEI', equipment_id: 'Equipamento principal',
  extra_imeis: 'IMEIs adicionais', warranty_rental: 'Garantia/Aluguer', intranet_account: 'Conta Intranet', intranet_license_plate: 'Matrícula Intranet',
  motive_id: 'Motivo', action_description: 'Descrição', assisted_material: 'Material assistido', spent_equipment_id: 'Equipamento gasto',
  spent_equipment_imei: 'IMEI gasto', return_equipment_id: 'Equipamento retomado', return_equipment_imei: 'IMEI retomado', return_modality: 'Modalidade da retoma',
  billing: 'Faturar', billing_observations: 'Obs. faturação', bundle_id: 'Bundle', dtc_active_realtime: 'DTC tempo real', configuration: 'Configuração',
  platform_id: 'Plataforma', observations: 'Observações', wow: 'WOW', services_status: 'Serviços ativo/desativo', account_services: 'Serviços da conta',
  validated_by: 'Validado por', crm_vehicle: 'Viatura CRM', contract_addendum: 'Contrato/Adenda', zoho_form: 'Formulário Zoho', ticket: 'Ticket',
  stock_exit_warehouse_id: 'Armazém de saída', stock_entry_warehouse_id: 'Armazém de entrada',
  accessories_spent: 'Acessórios gastos', accessories_returned: 'Acessórios retomados',
}
/** campos que guardam um id → tabela onde está o nome */
const FK: Record<string, string> = {
  technician_id: 'technicians', client_id: 'clients', intervention_type_id: 'intervention_types', equipment_id: 'equipment_list',
  spent_equipment_id: 'equipment_list', return_equipment_id: 'equipment_list', motive_id: 'motives', bundle_id: 'bundles', platform_id: 'platforms',
  validated_by: 'technicians', stock_exit_warehouse_id: 'warehouses', stock_entry_warehouse_id: 'warehouses',
}
const norm = (v: unknown) => (v == null ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim())
type Line = { accessory_id: string; quantity: number }

/**
 * Compara o registo antes e depois de uma edição e guarda o que mudou (com os nomes em vez dos ids).
 * Chamar dentro da transação da edição, com o registo e os acessórios ANTERIORES.
 */
export async function recordInterventionChanges(
  tx: TransactionSql, id: string, by: string,
  prev: Record<string, unknown>, next: Record<string, unknown>,
  prevAcc: { spent: Line[]; returned: Line[] }, nextAcc: { spent: Line[]; returned: Line[] },
) {
  const raw: { field: string; old: string; new: string }[] = []
  for (const k of Object.keys(next)) {
    if (!(k in LABELS)) continue
    const a = norm(prev[k]), b = norm(next[k])
    if (a !== b) raw.push({ field: k, old: a, new: b })
  }
  // nomes dos ids envolvidos
  const names = new Map<string, string>()
  for (const table of new Set(Object.values(FK))) {
    const ids = raw.filter((c) => FK[c.field] === table).flatMap((c) => [c.old, c.new]).filter(Boolean)
    if (!ids.length) continue
    for (const r of await tx<{ id: string; name: string }[]>`select id, name from ${tx(table)} where id = any(${ids})`) names.set(r.id, r.name)
  }
  const accIds = [...prevAcc.spent, ...prevAcc.returned, ...nextAcc.spent, ...nextAcc.returned].map((l) => l.accessory_id)
  const accNames = new Map((accIds.length ? await tx<{ id: string; name: string }[]>`select id, name from accessories where id = any(${accIds})` : []).map((r) => [r.id, r.name]))
  const list = (ls: Line[]) => ls.map((l) => `${l.quantity}× ${accNames.get(l.accessory_id) ?? l.accessory_id}`).sort().join('; ')
  const changes: Change[] = raw.map((c) => ({
    field: c.field, label: LABELS[c.field],
    old: FK[c.field] ? names.get(c.old) ?? c.old : c.old, new: FK[c.field] ? names.get(c.new) ?? c.new : c.new,
  }))
  for (const [k, a, b] of [['accessories_spent', list(prevAcc.spent), list(nextAcc.spent)], ['accessories_returned', list(prevAcc.returned), list(nextAcc.returned)]] as const)
    if (a !== b) changes.push({ field: k, label: LABELS[k], old: a, new: b })
  if (changes.length) await tx`insert into intervention_history ${tx({ intervention_id: id, changed_by: by, changes: tx.json(changes) })}`
  return changes.length
}
