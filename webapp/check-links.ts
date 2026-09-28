// Diagnóstico: mostra o que está gravado nos campos de links (não altera nada)
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const sql = postgres(process.env.DATABASE_URL!, { connection: { search_path: 'gestao_interv' } })
const main = async () => {
  const [n] = await sql`select count(*) filter (where zoho_form like '%<http%')::int as zoho,
                               count(*) filter (where crm_vehicle like '%<http%')::int as crm,
                               count(*) filter (where contract_addendum like '%<http%')::int as contrato from interventions`
  console.log('Registos com link:', n)
  const rows = await sql`select id, intervention_date, legacy_key is not null as importado, updated_by, crm_vehicle, contract_addendum, zoho_form
                         from interventions where license_plate ilike '%CL-06-TV%' or license_plate ilike '%CL06TV%'`
  console.table(rows)
  await sql.end()
}
main()
