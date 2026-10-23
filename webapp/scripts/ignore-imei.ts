/**
 * Marca IMEIs como IGNORADOS em toda a app e remove-os da BD (movimentos manuais e tabela devices).
 * Os movimentos vindos de intervenções ficam (fazem parte do registo da intervenção), mas deixam de contar no stock.
 *   npx tsx scripts/ignore-imei.ts 624112025382557 [outro…] [--motivo "texto"]            → mostra, não altera
 *   npx tsx scripts/ignore-imei.ts 624112025382557 --confirm
 *   npx tsx scripts/ignore-imei.ts 624112025382557 --desfazer --confirm                    → volta a considerar
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const argv = process.argv.slice(2)
const CONFIRM = argv.includes('--confirm'), UNDO = argv.includes('--desfazer')
const mi = argv.indexOf('--motivo')
const MOTIVO = mi >= 0 ? argv[mi + 1] : 'IMEI inválido / a ignorar'
const IMEIS = argv.filter((a, i) => /^\d{8,20}$/.test(a) && argv[i - 1] !== '--motivo')
if (!IMEIS.length) { console.error('Uso: npx tsx scripts/ignore-imei.ts <IMEI> [...] [--motivo "…"] [--confirm] [--desfazer]'); process.exit(1) }
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  for (const imei of IMEIS) {
    const [m] = await sql<{ manual: number; interv: number }[]>`
      select count(*) filter (where intervention_id is null)::int as manual, count(*) filter (where intervention_id is not null)::int as interv
      from stock_movements where imei = ${imei}`
    const [d] = await sql<{ n: number }[]>`select count(*)::int as n from devices where imei = ${imei}`
    const [i] = await sql<{ n: number }[]>`select count(*)::int as n from interventions where ${imei} in (imei, spent_equipment_imei, return_equipment_imei)`
    console.log(`${imei}: ${m.manual} movimento(s) manuais, ${m.interv} de intervenções, ${d.n} na tabela devices, ${i.n} intervenção(ões) com este IMEI`)
  }
  if (!CONFIRM) { console.log(`\nNada foi alterado. Para ${UNDO ? 'voltar a considerar' : 'ignorar e remover'}, corra de novo com --confirm`); return sql.end() }
  if (UNDO) {
    await sql`delete from ignored_imeis where imei = any(${IMEIS})`
    console.log('\nIMEIs voltam a ser considerados (os movimentos manuais removidos não voltam).')
    return sql.end()
  }
  await sql.begin(async (tx) => {
    await tx`insert into ignored_imeis ${tx(IMEIS.map((imei) => ({ imei, reason: MOTIVO, created_by: 'script:ignore-imei' })))} on conflict (imei) do nothing`
    await tx`delete from stock_movements where imei = any(${IMEIS}) and intervention_id is null`
    await tx`delete from devices where imei = any(${IMEIS})`
  })
  console.log(`\n${IMEIS.length} IMEI(s) ignorados e removidos (movimentos manuais e devices). Não voltam pela sincronização da Intranet.`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
