/**
 * Põe a 0 o stock de acessórios de alguns armazéns, de uma só vez, com uma CONTAGEM a 0 por acessório
 * (fica no histórico de cada acessório e pode ser apagada lá, um a um, se for preciso desfazer).
 *
 *   npx tsx scripts/zero-accessory-warehouses.ts                → só mostra o que seria posto a 0 (não altera nada)
 *   npx tsx scripts/zero-accessory-warehouses.ts --confirm      → regista as contagens a 0
 *
 * Armazéns tratados: "Sem armazém" (acessórios sem armazém), "Equip. Pago" e "A7 - Retoma".
 * Outros: --wh "parte do nome" (pode repetir), ex.: --wh "Abate"
 *
 *   npx tsx scripts/zero-accessory-warehouses.ts --sem-contagem             → mostra as células SEM contagem (sem ✓)
 *   npx tsx scripts/zero-accessory-warehouses.ts --sem-contagem --confirm   → regista contagem a 0 em todas elas
 *     (acessórios ativos × armazéns que já aparecem na tabela; inclui as células com "—"; não toca nas que já têm ✓)
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const CONFIRM = argv.includes('--confirm')
const extra = argv.flatMap((a, i) => (a === '--wh' && argv[i + 1] ? [argv[i + 1]] : []))
const PATTERNS = ['equip%pago%', 'a7 %', ...extra.map((x) => `%${x.toLowerCase()}%`)]
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  if (argv.includes('--sem-contagem')) return uncounted()
  const whs = await sql<{ id: string; name: string }[]>`
    select id, name from warehouses where lower(name) like any(${PATTERNS}) order by name`
  console.log(`Armazéns: Sem armazém${whs.length ? ', ' + whs.map((w) => w.name).join(', ') : ''}`)
  const rows = await sql<{ item_id: string; item: string; warehouse_id: string | null; warehouse: string; quantity: number }[]>`
    select s.item_id, i.name as item, s.warehouse_id, coalesce(w.name, 'Sem armazém') as warehouse, s.quantity
    from accessory_stock s join accessory_stock_items i on i.id = s.item_id left join warehouses w on w.id = s.warehouse_id
    where s.quantity <> 0 and (s.warehouse_id is null or s.warehouse_id = any(${whs.map((w) => w.id)}))
    order by 4, 2`
  if (!rows.length) { console.log('\nNada a fazer: já está tudo a 0.'); return }
  let cur = ''
  for (const r of rows) {
    if (r.warehouse !== cur) { cur = r.warehouse; console.log(`\n${cur}`) }
    console.log(`  ${r.item}: ${r.quantity} → 0`)
  }
  console.log(`\n${rows.length} linha(s) de stock a pôr a 0.`)
  if (!CONFIRM) { console.log('Nada foi alterado. Para aplicar: --confirm'); return }
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  await sql`insert into accessory_movements ${sql(rows.map((r) => ({
    item_id: r.item_id, warehouse_id: r.warehouse_id, kind: 'contagem', quantity: 0, moved_at: today,
    notes: 'Acerto: stock posto a 0 (script zero-accessory-warehouses)', created_by: 'script',
  })))}`
  const left = await sql<{ n: number }[]>`
    select count(*)::int as n from accessory_stock where quantity <> 0 and (warehouse_id is null or warehouse_id = any(${whs.map((w) => w.id)}))`
  console.log(`\nContagens a 0 registadas. Linhas ainda diferentes de 0: ${left[0].n}.`)
}
/** Células sem contagem (acessório ativo × armazém que aparece na tabela) → contagem a 0 */
async function uncounted() {
  const rows = await sql<{ item_id: string; item: string; warehouse_id: string; warehouse: string; quantity: number | null }[]>`
    with cols as (select distinct s.warehouse_id from accessory_stock s join warehouses w on w.id = s.warehouse_id where w.active and w.type <> 'mobilizado')
    select i.id as item_id, i.name as item, w.id as warehouse_id, w.name as warehouse, s.quantity
    from accessory_stock_items i
    cross join cols c join warehouses w on w.id = c.warehouse_id
    left join accessory_stock s on s.item_id = i.id and s.warehouse_id = w.id
    where i.active and s.counted_at is null
    order by w.name, i.name`
  if (!rows.length) { console.log('Nada a fazer: todas as células já têm contagem.'); return }
  const withQty = rows.filter((r) => r.quantity)
  let cur = ''
  for (const r of withQty) {
    if (r.warehouse !== cur) { cur = r.warehouse; console.log(`\n${cur}`) }
    console.log(`  ${r.item}: ${r.quantity} → 0`)
  }
  console.log(`\n${rows.length} célula(s) sem contagem: ${withQty.length} com quantidade (acima) e ${rows.length - withQty.length} a 0 ou "—".`)
  if (!CONFIRM) { console.log('Nada foi alterado. Para aplicar: --sem-contagem --confirm'); return }
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const vals = rows.map((r) => ({ item_id: r.item_id, warehouse_id: r.warehouse_id, kind: 'contagem', quantity: 0, moved_at: today,
    notes: 'Acerto: sem contagem, posto a 0 (script zero-accessory-warehouses)', created_by: 'script' }))
  for (let i = 0; i < vals.length; i += 500) await sql`insert into accessory_movements ${sql(vals.slice(i, i + 500))}`
  console.log(`\n${rows.length} contagem(ns) a 0 registadas.`)
}

main().then(() => sql.end(), async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
