/**
 * Corre antes do arranque da app (npm "prestart"): aplica o db/schema.sql (idempotente), para o deploy nunca ficar
 * com código novo e base de dados antiga. Em JavaScript simples (não depende do tsx em produção).
 * Nunca impede o arranque: se falhar, regista o erro e a app arranca na mesma.
 * Desliga-se com SKIP_DB_SCHEMA=1.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'

const here = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  if (process.env.SKIP_DB_SCHEMA === '1') return console.log('[schema] ignorado (SKIP_DB_SCHEMA=1)')
  if (!process.env.DATABASE_URL) return console.log('[schema] ignorado (sem DATABASE_URL)')
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {}, connect_timeout: 15 })
  try {
    const t = Date.now()
    await sql.unsafe(fs.readFileSync(path.join(here, '..', 'db', 'schema.sql'), 'utf8'))
    console.log(`[schema] aplicado em ${Date.now() - t} ms`)
    await sql`insert into gestao_interv.app_settings (key, value, updated_by) values ('schema_last_run', ${JSON.stringify({ at: new Date().toISOString(), ok: true })}, 'arranque')
              on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`.catch(() => {})
  } catch (e) {
    console.error(`[schema] FALHOU: ${e.message}`)
    await sql`insert into gestao_interv.app_settings (key, value, updated_by) values ('schema_last_run', ${JSON.stringify({ at: new Date().toISOString(), ok: false, error: String(e.message).slice(0, 300) })}, 'arranque')
              on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`.catch(() => {})
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}
main().catch((e) => console.error(`[schema] FALHOU: ${e.message}`)).finally(() => process.exit(0))
