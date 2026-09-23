import 'server-only'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import type { ReferenceData } from '@/types/database'

export type InterventionListItem = {
  id: string
  intervention_date: string
  license_plate: string | null
  imei: string | null
  action_description: string | null
  motive_text: string | null
  client: { name: string } | null
  technician: { name: string } | null
  intervention_type: { name: string } | null
}

export async function getInterventions({
  page = 1,
  pageSize = 20,
  clientSearch = '',
  techSearch = '',
  plateSearch = '',
}: {
  page?: number
  pageSize?: number
  clientSearch?: string
  techSearch?: string
  plateSearch?: string
} = {}) {
  await requireUser()
  try {
    const like = (s: string) => `%${s.replace(/[\\%_]/g, m => '\\' + m)}%`
    const where = sql`
      where true
      ${clientSearch ? sql`and c.name ilike ${like(clientSearch)}` : sql``}
      ${techSearch ? sql`and t.name ilike ${like(techSearch)}` : sql``}
      ${plateSearch ? sql`and (i.license_plate ilike ${like(plateSearch)} or i.imei ilike ${like(plateSearch)} or i.crm_vehicle ilike ${like(plateSearch)})` : sql``}
    `
    const from = sql`
      from interventions i
      left join clients c on c.id = i.client_id
      left join technicians t on t.id = i.technician_id
      left join intervention_types it on it.id = i.intervention_type_id
    `
    const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count ${from} ${where}`
    const rows = await sql<InterventionListItem[]>`
      select i.id, i.intervention_date, i.license_plate, i.imei, i.action_description, i.motive_text,
        case when c.id is null then null else json_build_object('name', c.name) end as client,
        case when t.id is null then null else json_build_object('name', t.name) end as technician,
        case when it.id is null then null else json_build_object('name', it.name) end as intervention_type
      ${from} ${where}
      order by i.intervention_date desc, i.created_at desc
      limit ${pageSize} offset ${(page - 1) * pageSize}
    `
    return { interventions: rows, count, totalPages: Math.ceil(count / pageSize), error: null }
  } catch (e) {
    return { interventions: [], count: 0, totalPages: 0, error: e as Error }
  }
}

export async function getInterventionById(id: string) {
  await requireUser()
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const [row] = await sql`
    select i.*,
      json_build_object('name', t.name)   as technician,
      json_build_object('name', c.name)   as client,
      json_build_object('name', it.name)  as intervention_type,
      json_build_object('name', e.name)   as equipment,
      json_build_object('name', m.name)   as motive,
      json_build_object('name', b.name)   as bundle,
      json_build_object('name', p.name)   as platform,
      json_build_object('name', v.name)   as validated_by_tech,
      json_build_object('name', ws.name)  as stock_exit_warehouse,
      json_build_object('name', we.name)  as stock_entry_warehouse
    from interventions i
    left join technicians t on t.id = i.technician_id
    left join clients c on c.id = i.client_id
    left join intervention_types it on it.id = i.intervention_type_id
    left join equipment_list e on e.id = i.equipment_id
    left join motives m on m.id = i.motive_id
    left join bundles b on b.id = i.bundle_id
    left join platforms p on p.id = i.platform_id
    left join technicians v on v.id = i.validated_by
    left join warehouses ws on ws.id = i.stock_exit_warehouse_id
    left join warehouses we on we.id = i.stock_entry_warehouse_id
    where i.id = ${id}
  `
  return row ?? null
}

const list = (table: string, activeOnly: boolean) =>
  activeOnly
    ? sql`select * from ${sql(table)} where active order by name`
    : sql`select * from ${sql(table)} order by active desc, name`

/** Listas de apoio. activeOnly=false para o ecrã de Configurações (mostra também inativos). */
export async function getReferenceData(activeOnly = true): Promise<ReferenceData> {
  await requireUser()
  const [
    technicians, interventionTypes, motives, actionsPerformed, equipmentList, bundles, accessories,
    billingOptions, warehouses, intranetAccounts, warrantyOptions, platforms, clients,
  ] = await Promise.all([
    list('technicians', activeOnly), list('intervention_types', activeOnly), list('motives', activeOnly),
    list('actions_performed', activeOnly), list('equipment_list', activeOnly), list('bundles', activeOnly),
    list('accessories', activeOnly), list('billing_options', activeOnly), list('warehouses', activeOnly),
    list('intranet_accounts', activeOnly), list('warranty_options', activeOnly), list('platforms', activeOnly),
    list('clients', activeOnly),
  ])
  return {
    technicians, interventionTypes, motives, actionsPerformed, equipmentList, bundles, accessories,
    billingOptions, warehouses, intranetAccounts, warrantyOptions, platforms, clients,
  } as unknown as ReferenceData
}

export async function getStats() {
  await requireUser()
  const [[totals], byMonth, byTech] = await Promise.all([
    sql<{ interventions: number; technicians: number; clients: number; months: number }[]>`
      select
        (select count(*)::int from interventions) as interventions,
        (select count(*)::int from technicians where active) as technicians,
        (select count(*)::int from clients where active) as clients,
        (select count(distinct date_trunc('month', intervention_date))::int from interventions) as months
    `,
    sql<{ month: string; count: number }[]>`
      select to_char(date_trunc('month', intervention_date), 'YYYY-MM') as month, count(*)::int as count
      from interventions
      where intervention_date >= date_trunc('month', current_date) - interval '11 months'
      group by 1 order by 1
    `,
    sql<{ name: string; count: number }[]>`
      select coalesce(t.name, '(sem técnico)') as name, count(*)::int as count
      from interventions i left join technicians t on t.id = i.technician_id
      where i.intervention_date >= current_date - interval '90 days'
      group by 1 order by 2 desc limit 10
    `,
  ])
  return { totals, byMonth, byTech }
}
