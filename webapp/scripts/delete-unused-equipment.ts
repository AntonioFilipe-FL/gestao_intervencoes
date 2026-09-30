/**
 * Equipamentos que NÃO estão usados em lado nenhum (intervenções nem movimentos de stock).
 *   npx tsx scripts/delete-unused-equipment.ts                         → lista usados/não usados, não apaga
 *   npx tsx scripts/delete-unused-equipment.ts --confirm "Nome A" "Nome B" → apaga só esses (se não estiverem usados)
 *   npx tsx scripts/delete-unused-equipment.ts --confirm --all-unused  → apaga todos os não usados
 * Kits e mapeamento de hardware desse equipamento são apagados em cascata.
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const args = process.argv.slice(2)
const CONFIRM = args.includes('--confirm')
const ALL = args.includes('--all-unused')
const names = args.filter((a) => !a.startsWith('--')).map((n) => n.trim().toLowerCase())
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

type Row = { id: string; name: string; active: boolean; interv: number; stock: number; kits: number; hw: number }

async function main() {
  const rows = await sql<Row[]>`
    select e.id, e.name, e.active,
      (select count(*) from interventions i
        where i.equipment_id = e.id or i.spent_equipment_id = e.id or i.return_equipment_id = e.id)::int as interv,
      (select count(*) from stock_movements m where m.equipment_id = e.id)::int as stock,
      (select count(*) from equipment_kit_items k where k.equipment_id = e.id)::int as kits,
      (select count(*) from hardware_map h where h.equipment_id = e.id)::int as hw
    from equipment_list e order by e.name`
  const unused = rows.filter((r) => r.interv === 0 && r.stock === 0)
  const used = rows.filter((r) => r.interv > 0 || r.stock > 0)

  console.log(`Equipamentos: ${rows.length} | usados: ${used.length} | NÃO usados: ${unused.length}\n`)
  console.log('--- NÃO usados (podem ser apagados) ---')
  for (const r of unused)
    console.log(`  ${r.name}${r.active ? '' : '  [Só histórico]'}${r.kits ? `  (kit: ${r.kits} acessórios)` : ''}${r.hw ? `  (hardware mapeado: ${r.hw})` : ''}`)

  if (names.length) {
    const blocked = used.filter((r) => names.includes(r.name.trim().toLowerCase()))
    for (const r of blocked) console.log(`\n! "${r.name}" está usado (${r.interv} intervenções, ${r.stock} movimentos de stock) — não será apagado.`)
    const missing = names.filter((n) => !rows.some((r) => r.name.trim().toLowerCase() === n))
    for (const n of missing) console.log(`\n! "${n}" não existe na lista de equipamentos.`)
  }

  const target = ALL ? unused : unused.filter((r) => names.includes(r.name.trim().toLowerCase()))
  if (!CONFIRM || !target.length) {
    if (CONFIRM && !target.length) console.log('\nNada para apagar: indique os nomes entre aspas ou use --all-unused.')
    else console.log('\nNada foi apagado. Para apagar: --confirm "Nome" "Outro nome"   ou   --confirm --all-unused')
    return sql.end()
  }
  const ids = target.map((r) => r.id)
  const del = await sql`
    delete from equipment_list e where e.id = any(${ids})
      and not exists (select 1 from interventions i where i.equipment_id = e.id or i.spent_equipment_id = e.id or i.return_equipment_id = e.id)
      and not exists (select 1 from stock_movements m where m.equipment_id = e.id)
    returning name`
  console.log(`\nApagados ${del.length}: ${del.map((d) => d.name).join(', ')}`)
  console.log('Atenção: se o nome estiver na folha "Listas de dados" ou nos CSV, a próxima importação volta a criá-lo.')
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
