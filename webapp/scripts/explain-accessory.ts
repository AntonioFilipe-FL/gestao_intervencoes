/**
 * Diagnóstico (só leitura): de onde vem o valor de um acessório em cada armazém.
 *   npx tsx scripts/explain-accessory.ts "Antena C4MAX"
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const NAME = process.argv[2] ?? 'Antena C4MAX'
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })
async function main() {
  const [it] = await sql<{ id: string }[]>`select id from accessory_stock_items where lower(name) = lower(${NAME})`
  if (!it) throw new Error(`Item "${NAME}" não existe no stock de acessórios.`)
  const rows = await sql<{ armazem: string; origem: string; n: number; qtd: number }[]>`
    select coalesce(w.name, '(sem armazém)') as armazem, origem, count(*)::int as n, sum(q)::int as qtd from (
      select warehouse_id, 'intervenção (' || direction || ')' as origem, quantity as q from accessory_intervention_moves where item_id = ${it.id}
      union all
      select warehouse_id, kind || ' · ' || coalesce(created_by, '—'), quantity from accessory_movements where item_id = ${it.id} and kind <> 'contagem'
      union all
      select warehouse_id, 'contagem', quantity from accessory_movements where item_id = ${it.id} and kind = 'contagem'
    ) x left join warehouses w on w.id = x.warehouse_id
    group by 1, 2 order by 1, 2`
  let cur = ''
  for (const r of rows) {
    if (r.armazem !== cur) { cur = r.armazem; console.log(`\n${cur}`) }
    console.log(`  ${r.origem.padEnd(60)} ${String(r.n).padStart(5)} mov.  ${r.qtd > 0 ? '+' : ''}${r.qtd}`)
  }
  const st = await sql<{ armazem: string; q: number }[]>`
    select coalesce(w.name, '(sem armazém)') as armazem, s.quantity as q from accessory_stock s left join warehouses w on w.id = s.warehouse_id
    where s.item_id = ${it.id} order by 1`
  console.log('\nStock calculado:'); for (const s of st) console.log(`  ${s.armazem.padEnd(28)} ${s.q}`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
