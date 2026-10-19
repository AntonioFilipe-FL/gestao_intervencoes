/**
 * Regista contagem 0 dos acessórios nos armazéns INATIVOS (ex.: Stock Frotcom, BM, SS…) e "sem armazém" não incluído,
 * para os saldos escondidos deixarem de pesar no Total do Stock de acessórios.
 *   npx tsx scripts/zero-inactive-accessories.ts            → lista, não altera
 *   npx tsx scripts/zero-inactive-accessories.ts --confirm  → regista as contagens (data de hoje)
 * Reversível: as contagens ficam em accessory_movements com created_by = 'script:zero-inactive-accessories'.
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<{ item_id: string; item: string; warehouse_id: string; warehouse: string; q: number }[]>`
    select s.item_id, si.name as item, s.warehouse_id, w.name as warehouse, s.quantity as q
    from accessory_stock s
    join warehouses w on w.id = s.warehouse_id and not w.active
    join accessory_stock_items si on si.id = s.item_id
    where s.quantity <> 0
    order by w.name, si.name`
  const byWh = new Map<string, { n: number; sum: number }>()
  for (const r of rows) { const t = byWh.get(r.warehouse) ?? { n: 0, sum: 0 }; t.n++; t.sum += r.q; byWh.set(r.warehouse, t) }
  console.log(`Saldos diferentes de 0 em armazéns inativos: ${rows.length}`)
  for (const [w, t] of byWh) console.log(`  ${w.padEnd(20)} ${t.n} acessório(s), saldo total ${t.sum}`)
  if (!CONFIRM) { console.log('\nNada foi alterado. Para registar contagem 0, corra de novo com --confirm'); return sql.end() }
  if (!rows.length) { console.log('\nNada a fazer.'); return sql.end() }
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const ins = rows.map((r) => ({ item_id: r.item_id, warehouse_id: r.warehouse_id, kind: 'contagem', quantity: 0, moved_at: today,
    notes: `Armazém inativo: saldo ${r.q} anulado`, created_by: 'script:zero-inactive-accessories' }))
  for (let i = 0; i < ins.length; i += 500) await sql`insert into accessory_movements ${sql(ins.slice(i, i + 500))}`
  console.log(`\nRegistadas ${ins.length} contagens a 0 (${today}).`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
