/**
 * Diagnóstico (só leitura): como é calculado o stock de um acessório num armazém —
 * a última contagem e cada movimento que conta depois dela (com a origem de cada um).
 *
 *   npx tsx scripts/trace-accessory.ts "Buzzer" RN
 *   npx tsx scripts/trace-accessory.ts "Buzzer" RN --todos     → também os movimentos ANTES da última contagem
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const [NAME, WH] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const ALL = process.argv.includes('--todos')
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, connection: { search_path: 'gestao_interv' } })
const d = (s: string) => s.slice(0, 10).split('-').reverse().join('/')

async function main() {
  if (!NAME || !WH) throw new Error('Uso: npx tsx scripts/trace-accessory.ts "<acessório>" "<armazém>"')
  const [it] = await sql<{ id: string; name: string }[]>`select id, name from accessory_stock_items where lower(btrim(name)) = lower(${NAME})`
  if (!it) throw new Error(`Acessório "${NAME}" não existe (nome exato do Stock de acessórios).`)
  const whs = await sql<{ id: string; name: string }[]>`select id, name from warehouses where lower(btrim(name)) = lower(${WH}) or name ilike ${WH + ' %'}`
  if (whs.length !== 1) throw new Error(`Armazém "${WH}": ${whs.length ? 'vários — ' + whs.map((w) => w.name).join(' | ') : 'não encontrado'}`)
  const wh = whs[0]
  const [stock] = await sql<{ quantity: number; counted_at: string | null }[]>`select quantity, counted_at::text from accessory_stock where item_id = ${it.id} and warehouse_id = ${wh.id}`
  console.log(`${it.name} · ${wh.name} · stock na app: ${stock?.quantity ?? 0}\n`)

  const [lc] = await sql<{ quantity: number; moved_at: string; created_at: string; created_by: string | null; notes: string | null }[]>`
    select quantity, moved_at::text, created_at::text, created_by, notes from accessory_movements
    where item_id = ${it.id} and warehouse_id = ${wh.id} and kind = 'contagem' order by moved_at desc, created_at desc limit 1`
  if (lc) console.log(`Última contagem: ${d(lc.moved_at)} = ${lc.quantity}  (${lc.created_by ?? '—'}${lc.notes ? ' · ' + lc.notes : ''})`)
  else console.log('Sem contagem: o stock é a soma de todos os movimentos.')

  const moves = await sql<{ date: string; created_at: string; origem: string; q: number; kind: string; detalhe: string | null; by: string | null }[]>`
    select * from (
      select m.moved_at::text as date, m.created_at::text, case m.kind when 'rececao' then 'Receção' when 'ajuste' then 'Ajuste'
               else case when m.quantity > 0 then 'Transferência (entrada)' else 'Transferência (saída)' end end as origem,
             m.quantity as q, m.kind,
             concat_ws(' · ', (select 'de/para ' || w2.name from accessory_movements m2 join warehouses w2 on w2.id = m2.warehouse_id
                               where m.group_id is not null and m2.group_id = m.group_id and m2.id <> m.id limit 1), m.notes) as detalhe, m.created_by as by
      from accessory_movements m where m.item_id = ${it.id} and m.warehouse_id = ${wh.id} and m.kind <> 'contagem'
      union all
      select a.moved_at::text, a.created_at::text, 'Intervenção (' || a.direction || ')', a.quantity, 'intervencao',
             concat_ws(' · ', c.name, i.license_plate, t.name, 'interv. ' || i.id), coalesce(i.updated_by, i.created_by)
      from accessory_intervention_moves a join interventions i on i.id = a.intervention_id
      left join clients c on c.id = i.client_id left join intervention_types t on t.id = i.intervention_type_id
      where a.item_id = ${it.id} and a.warehouse_id = ${wh.id}
      union all
      select k.moved_at::text, k.created_at::text, 'Kit com equipamento transferido', k.quantity, 'kit_transferencia',
             concat(case when k.quantity < 0 then 'para ' else 'de ' end, ow.name), null
      from accessory_kit_transfer_moves k left join warehouses ow on ow.id = k.other_wh
      where k.item_id = ${it.id} and k.warehouse_id = ${wh.id}
    ) x order by date, created_at`
  // mesma regra da vista accessory_stock: conta se for depois da data da contagem, ou no mesmo dia e registado depois (exceto intervenções)
  const counts = (m: (typeof moves)[number]) => !lc || m.date > lc.moved_at || (m.kind !== 'intervencao' && m.date === lc.moved_at && m.created_at > lc.created_at)
  let total = lc?.quantity ?? 0
  const shown = ALL ? moves : moves.filter(counts)
  console.log(`\nMovimentos ${ALL ? '(todos)' : 'que contam depois da contagem'}:`)
  for (const m of shown) {
    const c = counts(m)
    if (c) total += m.q
    console.log(`  ${d(m.date)}  ${String(m.q > 0 ? '+' + m.q : m.q).padStart(5)}  ${m.origem}${m.detalhe ? ' · ' + m.detalhe : ''}${m.by ? ' · ' + m.by : ''}${c ? `  → ${total}` : '  (antes da contagem: não conta)'}`)
  }
  console.log(`\nResultado: ${lc ? `${lc.quantity} (contagem)` : '0'} + movimentos = ${total}  ·  stock na app: ${stock?.quantity ?? 0}`)
}
main().then(() => sql.end(), async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
