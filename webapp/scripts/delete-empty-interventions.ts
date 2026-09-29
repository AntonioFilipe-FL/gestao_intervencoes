/**
 * Apaga as intervenções VAZIAS importadas da Sheet (só com data: sem técnico, cliente, tipo, matrícula, IMEI,
 * equipamentos nem descrição). Não mexe em registos criados ou editados na app.
 *   npx tsx scripts/delete-empty-interventions.ts            → só mostra o que seria apagado
 *   npx tsx scripts/delete-empty-interventions.ts --confirm  → apaga
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })
const empty = sql`
  i.legacy_key is not null and i.updated_by is null
  and i.technician_id is null and i.client_id is null and i.intervention_type_id is null
  and nullif(btrim(i.license_plate), '') is null and nullif(btrim(i.imei), '') is null
  and nullif(btrim(i.spent_equipment_imei), '') is null and i.equipment_id is null
  and nullif(btrim(i.action_description), '') is null and nullif(btrim(i.observations), '') is null`

async function main() {
  const rows = await sql`select i.id, i.intervention_date::text as data from interventions i where ${empty} order by 2`
  console.log(`Intervenções vazias: ${rows.length}`)
  for (const r of rows) console.log(`  ${r.data}  ${r.id}`)
  if (!CONFIRM) console.log('\nNada foi apagado. Para apagar, corra de novo com --confirm')
  else if (rows.length) {
    const del = await sql`delete from interventions i where ${empty} returning id`
    console.log(`\nApagadas ${del.length} intervenções vazias.`)
  }
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
