/**
 * Dá entrada (no armazém onde o equipamento entrou) dos acessórios do kit dos equipamentos que entraram ANTES da regra nova:
 *   receções automáticas (Shipped on), receções manuais (sem acertos/substituições RMA) e intervenções "Entrada de Material"
 *   que não têm acessórios registados na própria intervenção.
 *   npx tsx scripts/backfill-kit-accessories.ts            → lista, não altera
 *   npx tsx scripts/backfill-kit-accessories.ts --confirm  → regista as entradas
 * Não repete: um dia que já tem a entrada automática dos acessórios do kit é ignorado.
 * Nota: se houve uma contagem de acessórios no armazém depois dessa data, a contagem prevalece (o stock não muda).
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const LABEL: Record<string, string> = { auto: 'automática', manual: 'receção manual', interv: 'Entrada de Material' }
const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<{ src: string; day: string; warehouse_id: string; warehouse: string; item_id: string; item: string; qty: number; n_eq: number; counted_after: boolean }[]>`
    with src as (
      -- 1) receções automáticas (Intranet / Shipped on)
      select 'auto' as src, m.moved_at, m.to_warehouse_id, m.equipment_id
      from stock_movements m
      where m.created_by = 'auto:rececao-intranet' and m.kind = 'rececao' and m.superseded_at is null
      union all
      -- 2) receções manuais (botão Receção), sem as correções (acertos, substituições RMA)
      select 'manual', m.moved_at, m.to_warehouse_id, m.equipment_id
      from stock_movements m
      where m.kind = 'rececao' and m.intervention_id is null and m.superseded_at is null and not m.is_correction
        and coalesce(m.created_by, '') <> 'auto:rececao-intranet'
      union all
      -- 3) intervenções "Entrada de Material" sem acessórios registados na própria intervenção
      select 'interv', m.moved_at, m.to_warehouse_id, m.equipment_id
      from stock_movements m
      join interventions i on i.id = m.intervention_id
      join intervention_types t on t.id = i.intervention_type_id and lower(btrim(t.name)) = 'entrada de material'
      where m.kind = 'intervencao_entrada' and m.superseded_at is null
        and i.intervention_date < date '2026-10-01' -- a partir daí o kit entra automaticamente (vista accessory_intervention_moves)
        and not exists (select 1 from intervention_accessories ia where ia.intervention_id = i.id)
    ), rec as (
      select s.src, s.moved_at, s.to_warehouse_id, s.equipment_id, count(*)::int as n
      from src s
      where s.equipment_id is not null and s.to_warehouse_id is not null
        and not exists (select 1 from accessory_movements a
                        where a.moved_at = s.moved_at
                          -- armazém inativo (ex.: Stock Frotcom): as entradas foram refeitas no A1/A2 (move-backfill-accessories)
                          and (a.warehouse_id = s.to_warehouse_id
                               or exists (select 1 from warehouses iw where iw.id = s.to_warehouse_id and not iw.active))
                          and ((s.src = 'auto' and a.created_by = 'auto:rececao-intranet' and a.notes not like '%[kit:%')
                               or a.notes like '%[kit:' || s.src || ']%'))
      group by 1, 2, 3, 4
    )
    select r.src, r.moved_at::text as day, r.to_warehouse_id as warehouse_id, w.name as warehouse, km.item_id, si.name as item,
           sum(r.n * k.quantity)::int as qty, sum(r.n)::int as n_eq,
           exists (select 1 from accessory_movements c where c.kind = 'contagem' and c.item_id = km.item_id
                   and c.warehouse_id = r.to_warehouse_id and c.moved_at > r.moved_at) as counted_after
    from rec r
    join warehouses w on w.id = r.to_warehouse_id
    join equipment_kit_items k on k.equipment_id = r.equipment_id
    join accessory_stock_map km on km.accessory_id = k.accessory_id
    join accessory_stock_items si on si.id = km.item_id
    group by 1, 2, 3, 4, 5, 6, 9
    order by 2, 1, 6`

  console.log(`Entradas de acessórios em falta (receções automáticas antigas): ${rows.length}`)
  const tot = new Map<string, number>()
  for (const r of rows) {
    console.log(`  ${r.day}  [${LABEL[r.src] ?? r.src}]  ${r.warehouse}  ${r.item}: +${r.qty}${r.counted_after ? '   (há contagem posterior — não altera o stock atual)' : ''}`)
    tot.set(r.item, (tot.get(r.item) ?? 0) + r.qty)
  }
  if (tot.size) { console.log('\nTotal por acessório:'); for (const [k, v] of [...tot].sort()) console.log(`  ${k}: +${v}`) }

  if (!CONFIRM) { console.log('\nNada foi alterado. Para registar, corra de novo com --confirm'); return sql.end() }
  if (!rows.length) { console.log('\nNada a registar.'); return sql.end() }
  await sql`insert into accessory_movements ${sql(rows.map((r) => ({
    item_id: r.item_id, warehouse_id: r.warehouse_id, kind: 'rececao', quantity: r.qty, moved_at: r.day,
    notes: `Kit dos equipamentos (${LABEL[r.src] ?? r.src} de ${r.day.split('-').reverse().join('/')}) · retroativo [kit:${r.src}]`,
    created_by: 'script:backfill-kit-accessories',
  })))}`
  console.log(`\nRegistadas ${rows.length} entradas de acessórios.`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
