/**
 * Anula transferências manuais feitas com informação desatualizada: o IMEI já tinha saído do stock
 * por uma intervenção com data ANTERIOR à transferência, mas essa intervenção só foi registada/importada DEPOIS.
 * (ex.: separação Venda/Aluguer de 30/09 sobre IMEIs instalados a 29/09 que só entraram na importação seguinte)
 *   npx tsx scripts/fix-stale-transfers.ts            → lista, não altera nada
 *   npx tsx scripts/fix-stale-transfers.ts --confirm  → anula (apaga) essas transferências
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<{ id: string; imei: string; transf: string; de: string; para: string; saida: string; tipo: string; cliente: string; matricula: string }[]>`
    select m.id, m.imei, m.moved_at::text as transf, wf.name as de, wt.name as para,
           s.moved_at::text as saida, coalesce(it.name, '') as tipo, coalesce(c.name, '') as cliente, coalesce(i.license_plate, '') as matricula
    from stock_movements m
    join lateral (
      -- último movimento de intervenção desse IMEI com data até à da transferência
      select x.* from stock_movements x
      where x.imei = m.imei and x.intervention_id is not null and x.moved_at <= m.moved_at
      order by x.moved_at desc, x.seq desc limit 1
    ) s on s.kind = 'intervencao_saida' and s.created_at > m.created_at
    left join interventions i on i.id = s.intervention_id
    left join intervention_types it on it.id = i.intervention_type_id
    left join clients c on c.id = i.client_id
    left join warehouses wf on wf.id = m.from_warehouse_id
    left join warehouses wt on wt.id = m.to_warehouse_id
    where m.intervention_id is null and m.kind = 'transferencia' and m.superseded_at is null
    order by c.name, m.imei`

  console.log(`Transferências desatualizadas: ${rows.length}\n`)
  for (const r of rows)
    console.log(`  ${r.imei}  ${r.de} → ${r.para} (${r.transf})  | saiu a ${r.saida}: ${r.tipo} ${r.cliente} ${r.matricula}`)

  if (!CONFIRM || !rows.length) {
    if (!CONFIRM) console.log('\nNada foi alterado. Para anular estas transferências, corra de novo com --confirm')
    return sql.end()
  }
  const del = await sql`delete from stock_movements where id = any(${rows.map((r) => r.id)}) and intervention_id is null returning id`
  console.log(`\nAnuladas ${del.length} transferências. Esses IMEIs voltam a contar como saídos pela intervenção.`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
