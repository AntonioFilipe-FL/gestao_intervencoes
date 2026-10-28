/**
 * IMEIs no "Instalado Aluguer (Mobilizado)" que estão como VENDA (ex.: modalidade mudada antes desta correção).
 * Um equipamento vendido é do cliente → sai do stock (movimento de correção, pode ser anulado no histórico).
 *
 *   npx tsx scripts/fix-mobilized-venda.ts            → lista, não altera nada
 *   npx tsx scripts/fix-mobilized-venda.ts --confirm  → retira-os do stock
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<{ imei: string; warehouse_id: string; warehouse: string; equipment: string | null }[]>`
    select c.imei, c.warehouse_id, w.name as warehouse, e.name as equipment
    from stock_current c join warehouses w on w.id = c.warehouse_id
    left join equipment_list e on e.id = c.equipment_id
    where w.type = 'mobilizado' and c.modality = 'Venda' order by c.imei`
  console.log(`${rows.length} IMEI(s) em Venda no armazém mobilizado:`)
  for (const r of rows) console.log(`  ${r.imei}  ${r.equipment ?? '(sem equipamento)'}  [${r.warehouse}]`)
  if (!rows.length) return
  if (!CONFIRM) { console.log('\nNada alterado. Para os retirar do stock: --confirm'); return }
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  await sql`insert into stock_movements ${sql(rows.map((r) => ({
    imei: r.imei, equipment_id: null, kind: 'ajuste', from_warehouse_id: r.warehouse_id, to_warehouse_id: null, modality: 'Venda',
    moved_at: today, is_correction: true, created_by: 'script fix-mobilized-venda', notes: 'Em Venda no mobilizado: sai do stock (vendido ao cliente)',
  })))}`
  console.log(`\n${rows.length} IMEI(s) retirados do stock mobilizado.`)
}
main().then(() => sql.end(), async (e) => { console.error(e.message); await sql.end(); process.exit(1) })
