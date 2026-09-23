/** Cria/atualiza as tabelas: npm run db:schema (usa DATABASE_URL do .env.local) */
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '.env.local' })

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definido em .env.local')
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
  const ddl = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
  await sql.unsafe(ddl)
  const tables = await sql`select table_name from information_schema.tables where table_schema = 'gestao_interv' order by 1`
  console.log(`Esquema aplicado. Tabelas: ${tables.map(t => t.table_name).join(', ')}`)
  await sql.end()
}

main().catch(e => { console.error('FALHOU:', e.message); process.exit(1) })
