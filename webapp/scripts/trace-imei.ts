/**
 * Mostra o histórico de stock de um IMEI e as intervenções onde aparece (só leitura).
 *   npx tsx scripts/trace-imei.ts 864303055572450
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const IMEI = (process.argv[2] ?? '').trim()
if (!/^[0-9]{14,15}$/.test(IMEI)) { console.error('Uso: npx tsx scripts/trace-imei.ts <IMEI>'); process.exit(1) }
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const moves = await sql<Record<string, string | null>[]>`
    select m.moved_at::text as data, m.kind, fw.name as de, tw.name as para, m.modality, m.notes, m.created_by,
           m.superseded_at::text as anulado, it.name as tipo_interv, i.venda_aluguer as modal_interv, c.name as cliente, c.venda_aluguer as modal_cliente,
           (i.stock_entry_warehouse_id is not null)::text as tem_arm_entrada, i.return_equipment_imei as imei_retomado
    from stock_movements m
    left join warehouses fw on fw.id = m.from_warehouse_id left join warehouses tw on tw.id = m.to_warehouse_id
    left join interventions i on i.id = m.intervention_id left join intervention_types it on it.id = i.intervention_type_id
    left join clients c on c.id = i.client_id
    where m.imei = ${IMEI} order by m.moved_at, m.created_at`
  console.log(`Movimentos de ${IMEI}: ${moves.length}`)
  for (const m of moves) console.log(' ', JSON.stringify(m))
  const [cur] = await sql`select w.name from stock_current s left join warehouses w on w.id = s.warehouse_id where s.imei = ${IMEI}`
  console.log(`\nHoje em: ${cur?.name ?? 'fora do stock'}`)
  const iv = await sql<Record<string, string | null>[]>`
    select i.intervention_date::text as data, it.name as tipo, c.name as cliente, i.venda_aluguer, c.venda_aluguer as modal_cliente,
           i.license_plate, i.imei, i.spent_equipment_imei, i.return_equipment_imei,
           ew.name as arm_saida, nw.name as arm_entrada, i.id
    from interventions i left join intervention_types it on it.id = i.intervention_type_id left join clients c on c.id = i.client_id
    left join warehouses ew on ew.id = i.stock_exit_warehouse_id left join warehouses nw on nw.id = i.stock_entry_warehouse_id
    where ${IMEI} in (gestao_interv.imei_norm(i.imei), gestao_interv.imei_norm(i.spent_equipment_imei), gestao_interv.imei_norm(i.return_equipment_imei))
    order by i.intervention_date`
  console.log(`\nIntervenções com este IMEI: ${iv.length}`)
  for (const r of iv) console.log(' ', JSON.stringify(r))
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
