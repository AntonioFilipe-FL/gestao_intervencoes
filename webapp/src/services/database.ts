import { createClient } from '@/utils/supabase/server'

export async function getInterventions({
  page = 1,
  pageSize = 10,
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
  const supabase = await createClient()
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  let query = supabase
    .schema('gestao_interv')
    .from('interventions')
    .select(`
      *,
      technician:technician_id(name),
      client:client_id(name),
      intervention_type:intervention_type_id(name)
    `, { count: 'exact' })

  // Filtro por Cliente
  if (clientSearch) {
    const { data: matchedClients } = await supabase
      .schema('gestao_interv')
      .from('clients')
      .select('id')
      .ilike('name', `%${clientSearch}%`)
    const ids = matchedClients?.map(c => c.id) || []
    query = query.in('client_id', ids)
  }

  // Filtro por Técnico
  if (techSearch) {
    const { data: matchedTechs } = await supabase
      .schema('gestao_interv')
      .from('technicians')
      .select('id')
      .ilike('name', `%${techSearch}%`)
    const ids = matchedTechs?.map(t => t.id) || []
    query = query.in('technician_id', ids)
  }

  // Filtro por Matrícula
  if (plateSearch) {
    query = query.or(`license_plate.ilike.%${plateSearch}%,crm_vehicle.ilike.%${plateSearch}%`)
  }

  const { data, error, count } = await query
    .order('intervention_date', { ascending: false })
    .range(from, to)

  return {
    interventions: data,
    error,
    count: count || 0,
    totalPages: count ? Math.ceil(count / pageSize) : 0
  }
}

export async function getReferenceData() {
  const supabase = await createClient()

  const [
    { data: technicians },
    { data: interventionTypes },
    { data: motives },
    { data: actionsPerformed },
    { data: equipmentList },
    { data: bundles },
    { data: accessories },
    { data: billingOptions },
    { data: warehouses },
    { data: intranetAccounts },
    { data: warrantyOptions },
    { data: platforms },
    { data: clients },
  ] = await Promise.all([
    supabase.schema('gestao_interv').from('technicians').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('intervention_types').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('motives').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('actions_performed').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('equipment_list').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('bundles').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('accessories').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('billing_options').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('warehouses').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('intranet_accounts').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('warranty_options').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('platforms').select('*').eq('active', true).order('name'),
    supabase.schema('gestao_interv').from('clients').select('*').eq('active', true).order('name'),
  ])

  return {
    technicians,
    interventionTypes,
    motives,
    actionsPerformed,
    equipmentList,
    bundles,
    accessories,
    billingOptions,
    warehouses,
    intranetAccounts,
    warrantyOptions,
    platforms,
    clients,
  }
}
