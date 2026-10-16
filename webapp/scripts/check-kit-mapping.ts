/**
 * Diagnóstico (só leitura): kits dos equipamentos vs mapeamento para o stock de acessórios,
 * e quantas entradas de equipamento existem por origem (para perceber o que o backfill-kit-accessories apanha).
 *   npx tsx scripts/check-kit-mapping.ts
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const kit = await sql<{ equipamento: string; acessorio: string; qtd: number; item_stock: string | null }[]>`
    select e.name as equipamento, a.name as acessorio, k.quantity as qtd, si.name as item_stock
    from equipment_kit_items k
    join equipment_list e on e.id = k.equipment_id
    join accessories a on a.id = k.accessory_id
    left join accessory_stock_map m on m.accessory_id = k.accessory_id
    left join accessory_stock_items si on si.id = m.item_id
    order by 1, 2`
  console.log('Kits (acessório → item do stock de acessórios):')
  for (const r of kit) console.log(`  ${r.equipamento.padEnd(14)} ${r.qtd}× ${r.acessorio.padEnd(32)} → ${r.item_stock ?? 'SEM MAPEAMENTO (ignorado)'}`)

  const ent = await sql<{ origem: string; com_eq: number; sem_eq: number }[]>`
    select origem, count(*) filter (where equipment_id is not null)::int as com_eq, count(*) filter (where equipment_id is null)::int as sem_eq
    from (
      select case when m.created_by = 'auto:rececao-intranet' then 'automática'
                  when m.intervention_id is null then 'receção manual' else 'Entrada de Material' end as origem, m.equipment_id
      from stock_movements m
      left join interventions i on i.id = m.intervention_id
      left join intervention_types t on t.id = i.intervention_type_id
      where m.superseded_at is null and (
        (m.kind = 'rececao' and (m.intervention_id is null) and (not m.is_correction or m.created_by = 'auto:rececao-intranet'))
        or (m.kind = 'intervencao_entrada' and lower(btrim(t.name)) = 'entrada de material'))
    ) x group by 1 order by 1`
  console.log('\nEntradas de equipamento por origem (com / sem equipamento identificado):')
  for (const r of ent) console.log(`  ${r.origem.padEnd(20)} com equipamento: ${r.com_eq}   sem equipamento: ${r.sem_eq}`)

  const byEq = await sql<{ equipamento: string; n: number }[]>`
    select coalesce(e.name, '(sem equipamento)') as equipamento, count(*)::int as n
    from stock_movements m left join equipment_list e on e.id = m.equipment_id
    where m.superseded_at is null and m.kind = 'rececao' and m.intervention_id is null
    group by 1 order by 2 desc limit 25`
  console.log('\nReceções (manuais + automáticas) por equipamento:')
  for (const r of byEq) console.log(`  ${r.equipamento.padEnd(20)} ${r.n}`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
