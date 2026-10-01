/**
 * Marca como PROCESSADAS as intervenções com Faturar = Sim que ainda estão por processar.
 *   npx tsx scripts/mark-billing-processed.ts                       → mostra quantas, não altera
 *   npx tsx scripts/mark-billing-processed.ts --confirm             → marca todas
 *   npx tsx scripts/mark-billing-processed.ts --ate 2026-09-30 --confirm → só as com data de intervenção até esse dia
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const CONFIRM = argv.includes('--confirm')
const i = argv.indexOf('--ate')
const ATE = i >= 0 ? argv[i + 1] : undefined
if (ATE && !/^\d{4}-\d{2}-\d{2}$/.test(ATE)) { console.error('--ate tem de ser AAAA-MM-DD'); process.exit(1) }
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

const where = sql`lower(btrim(billing)) = 'sim' and billing_processed_at is null
  ${ATE ? sql`and intervention_date <= ${ATE}::date` : sql``}`

async function main() {
  const [c] = await sql<{ n: number; min: string | null; max: string | null }[]>`
    select count(*)::int as n, min(intervention_date)::text as min, max(intervention_date)::text as max from interventions where ${where}`
  console.log(`Por processar${ATE ? ` até ${ATE}` : ''}: ${c.n} (datas ${c.min ?? '—'} a ${c.max ?? '—'})`)
  if (!CONFIRM) { console.log('\nNada foi alterado. Para marcar, corra de novo com --confirm'); return sql.end() }
  const r = await sql`update interventions set billing_processed_at = now(), billing_processed_by = 'script:marcacao-inicial'
                      where ${where}`
  console.log(`\nMarcadas ${r.count} como processadas.`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
