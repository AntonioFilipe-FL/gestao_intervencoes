/** Diagnóstico (só leitura): npx tsx scripts/inspect-db.ts */
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '.env.local', quiet: true })

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} })
  const schemas = await sql`select schema_name from information_schema.schemata
    where schema_name not like 'pg_%' and schema_name <> 'information_schema' order by 1`
  console.log('Esquemas:', schemas.map(s => s.schema_name).join(', '))

  const tables = await sql`select table_schema, table_name from information_schema.tables
    where table_schema not in ('pg_catalog', 'information_schema') order by 1, 2`
  console.log('\nTabelas:')
  for (const t of tables) {
    const [{ n }] = await sql`select count(*)::int as n from ${sql(t.table_schema)}.${sql(t.table_name)}`
    console.log(`  ${t.table_schema}.${t.table_name}: ${n} linhas`)
  }

  const gi = tables.filter(t => t.table_schema === 'gestao_interv')
  for (const t of gi) {
    const cols = await sql`select column_name from information_schema.columns
      where table_schema = 'gestao_interv' and table_name = ${t.table_name}`
    if (!cols.some(c => c.column_name === 'name')) continue
    const dups = await sql`select lower(name) as nome, count(*)::int as vezes from ${sql('gestao_interv')}.${sql(t.table_name)}
      group by 1 having count(*) > 1 order by 2 desc limit 5`
    if (dups.length) console.log(`\nDuplicados em gestao_interv.${t.table_name}:`, dups.map(d => `${d.nome} (${d.vezes}x)`).join(', '))
  }
  await sql.end()
}

main().catch(e => { console.error('FALHOU:', e.message); process.exit(1) })
