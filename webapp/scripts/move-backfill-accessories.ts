/**
 * As entradas retroativas de acessórios (backfill-kit-accessories) que ficaram em armazéns INATIVOS
 * (ex.: "Stock Frotcom") são refeitas no A1 ou no A2, conforme a modalidade dos equipamentos que entraram:
 *   Venda → A1 · Aluguer → A2 · sem modalidade → A1
 *   npx tsx scripts/move-backfill-accessories.ts            → lista, não altera
 *   npx tsx scripts/move-backfill-accessories.ts --confirm  → substitui as entradas
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const [a1] = await sql<{ id: string; name: string }[]>`select id, name from warehouses where active and name ilike 'A1 %' order by name limit 1`
  const [a2] = await sql<{ id: string; name: string }[]>`select id, name from warehouses where active and name ilike 'A2 %' order by name limit 1`
  if (!a1 || !a2) throw new Error('Faltam os armazéns "A1 …" / "A2 …" ativos.')

  // entradas retroativas a refazer: as que estão num armazém inativo, ou no A1/A2 mas vindas de um armazém inativo
  // (caso a versão anterior deste script já as tenha passado todas para o A1)
  const old = await sql<{ id: string; moved_at: string; warehouse_id: string; src: string }[]>`
    with inactive_days as (
      select distinct m.moved_at from stock_movements m join warehouses w on w.id = m.to_warehouse_id
      where not w.active and m.superseded_at is null and m.kind in ('rececao', 'intervencao_entrada')
    )
    select a.id, a.moved_at::text, a.warehouse_id, substring(a.notes from '\\[kit:([a-z]+)\\]') as src
    from accessory_movements a join warehouses w on w.id = a.warehouse_id
    where a.created_by = 'script:backfill-kit-accessories'
      and (not w.active or (a.warehouse_id in (${a1.id}, ${a2.id}) and a.moved_at in (select moved_at from inactive_days)))`
  if (!old.length) { console.log('Não há entradas retroativas a refazer.'); return sql.end() }
  const days = [...new Set(old.map((o) => o.moved_at))]
  const inactive = (await sql<{ id: string }[]>`select id from warehouses where not active`).map((w) => w.id)
  const whs = [...inactive, a1.id, a2.id]

  // recalcula por modalidade a partir das entradas de equipamento desses dias/armazéns (mesmas regras do backfill)
  const rows = await sql<{ day: string; from_wh: string; mod: string | null; item_id: string; item: string; qty: number; src: string }[]>`
    with src as (
      select 'auto' as src, m.moved_at, m.to_warehouse_id, m.equipment_id, m.modality from stock_movements m
      where m.created_by = 'auto:rececao-intranet' and m.kind = 'rececao' and m.superseded_at is null
      union all
      select 'manual', m.moved_at, m.to_warehouse_id, m.equipment_id, m.modality from stock_movements m
      where m.kind = 'rececao' and m.intervention_id is null and m.superseded_at is null and not m.is_correction
        and coalesce(m.created_by, '') <> 'auto:rececao-intranet'
      union all
      select 'interv', m.moved_at, m.to_warehouse_id, m.equipment_id, m.modality from stock_movements m
      join interventions i on i.id = m.intervention_id
      join intervention_types t on t.id = i.intervention_type_id and lower(btrim(t.name)) = 'entrada de material'
      where m.kind = 'intervencao_entrada' and m.superseded_at is null
        and not exists (select 1 from intervention_accessories ia where ia.intervention_id = i.id)
    )
    select s.moved_at::text as day, s.to_warehouse_id as from_wh, s.modality as mod, km.item_id, si.name as item,
           sum(k.quantity)::int as qty, s.src
    from src s
    join equipment_kit_items k on k.equipment_id = s.equipment_id
    join accessory_stock_map km on km.accessory_id = k.accessory_id
    join accessory_stock_items si on si.id = km.item_id
    where s.moved_at::text = any(${days}) and s.to_warehouse_id = any(${whs})
    group by 1, 2, 3, 4, 5, 7`
  const wanted = rows.filter((r) => old.some((o) => o.moved_at === r.day && o.src === r.src))

  const agg = new Map<string, { day: string; wh: string; item_id: string; item: string; qty: number; src: string }>()
  for (const r of wanted) {
    // vindo de um armazém inativo → A1/A2 pela modalidade; entrada feita já no A1/A2 → mantém
    const wh = inactive.includes(r.from_wh) ? (r.mod === 'Aluguer' ? a2.id : a1.id) : r.from_wh
    const k = `${r.day}|${wh}|${r.item_id}|${r.src}`
    const cur = agg.get(k) ?? { day: r.day, wh, item_id: r.item_id, item: r.item, qty: 0, src: r.src }
    cur.qty += r.qty; agg.set(k, cur)
  }
  const tot = new Map<string, { a1: number; a2: number }>()
  for (const v of agg.values()) {
    const t = tot.get(v.item) ?? { a1: 0, a2: 0 }
    if (v.wh === a1.id) t.a1 += v.qty; else t.a2 += v.qty
    tot.set(v.item, t)
  }
  console.log(`Entradas retroativas a refazer: ${old.length}`)
  console.log(`\nNovas entradas: ${agg.size}  — por acessório (${a1.name} | ${a2.name}):`)
  for (const [k, v] of [...tot].sort()) console.log(`  ${k.padEnd(22)} A1: +${v.a1}   A2: +${v.a2}`)

  if (!CONFIRM) { console.log('\nNada foi alterado. Para substituir, corra de novo com --confirm'); return sql.end() }
  const LABEL: Record<string, string> = { auto: 'automática', manual: 'receção manual', interv: 'Entrada de Material' }
  await sql.begin(async (tx) => {
    await tx`delete from accessory_movements where id = any(${old.map((o) => o.id)})`
    const ins = [...agg.values()].map((v) => ({
      item_id: v.item_id, warehouse_id: v.wh, kind: 'rececao', quantity: v.qty, moved_at: v.day,
      notes: `Kit dos equipamentos (${LABEL[v.src] ?? v.src} de ${v.day.split('-').reverse().join('/')}) · retroativo [kit:${v.src}]`,
      created_by: 'script:backfill-kit-accessories',
    }))
    for (let i = 0; i < ins.length; i += 500) await tx`insert into accessory_movements ${tx(ins.slice(i, i + 500))}`
  })
  console.log(`\nSubstituídas ${old.length} entradas por ${agg.size} no A1/A2.`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
