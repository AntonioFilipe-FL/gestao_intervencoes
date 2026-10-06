/**
 * 1) Recalcula os movimentos de stock de todas as intervenções com as regras atuais (npm run db:schema primeiro).
 * 2) Procura transferências manuais/script que já não fazem sentido: o IMEI, na data da transferência,
 *    não estava no armazém de origem (ex.: tinha saído numa instalação). Essas deixam de contar (marcadas como substituídas).
 *
 *   npx tsx scripts/rebuild-and-check-transfers.ts            → recalcula e LISTA (não marca nada)
 *   npx tsx scripts/rebuild-and-check-transfers.ts --confirm  → recalcula e marca as transferências inválidas
 * O recálculo dos movimentos das intervenções é sempre feito (é o mesmo que o npm run migrate faz no fim).
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

type M = { id: string; imei: string; kind: string; from_wh: string | null; to_wh: string | null; manual: boolean; moved_at: string; superseded: boolean }

async function main() {
  const [{ n }] = await sql<{ n: number }[]>`select gestao_interv.rebuild_intervention_stock() as n`
  console.log(`Movimentos das intervenções recalculados: ${n}`)

  const names = new Map((await sql<{ id: string; name: string }[]>`select id, name from warehouses`).map((w) => [w.id, w.name]))
  // só IMEIs que têm transferências manuais ativas
  const moves = await sql<M[]>`
    select m.id, m.imei, m.kind, m.from_warehouse_id as from_wh, m.to_warehouse_id as to_wh,
           (m.intervention_id is null) as manual, m.moved_at::text, (m.superseded_at is not null) as superseded
    from stock_movements m
    where m.imei in (select imei from stock_movements where intervention_id is null and kind = 'transferencia' and superseded_at is null)
    order by m.imei, m.moved_at, m.seq`

  const invalid: (M & { where: string | null })[] = []
  let cur: string | null = null, curImei = '', seen = false
  for (const m of moves) {
    if (m.imei !== curImei) { curImei = m.imei; cur = null; seen = false }
    if (m.superseded) continue
    if (m.manual && m.kind === 'transferencia' && seen && m.from_wh !== cur) {
      invalid.push({ ...m, where: cur })
      continue // não conta: a localização mantém-se
    }
    seen = true
    cur = m.to_wh
  }

  console.log(`\nTransferências inválidas (o IMEI não estava no armazém de origem): ${invalid.length}`)
  for (const m of invalid.slice(0, 60))
    console.log(`  ${m.imei}  ${m.moved_at}  ${names.get(m.from_wh ?? '') ?? '—'} → ${names.get(m.to_wh ?? '') ?? '—'}   | estava em: ${m.where ? names.get(m.where) : 'fora do stock (instalado/saído)'}`)
  if (invalid.length > 60) console.log(`  … e mais ${invalid.length - 60}`)

  if (!CONFIRM) { console.log('\nNenhuma transferência foi marcada. Para as anular, corra de novo com --confirm'); return sql.end() }
  if (invalid.length) await sql`update stock_movements set superseded_at = now() where id = any(${invalid.map((m) => m.id)})`
  console.log(`\nMarcadas ${invalid.length} transferências como substituídas (deixam de contar).`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
