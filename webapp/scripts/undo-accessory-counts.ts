/**
 * Anula (apaga) as CONTAGENS de stock de um acessório feitas num dia, em todos os armazéns.
 * O stock desse acessório volta a ser calculado pela contagem anterior + movimentos.
 *
 *   npx tsx scripts/undo-accessory-counts.ts --item "Cablagem GV57"                    → mostra as contagens de hoje (não altera nada)
 *   npx tsx scripts/undo-accessory-counts.ts --item "Cablagem GV57" --date 2026-11-20  → outro dia
 *   … --confirm                                                                        → apaga-as
 *
 * --item: nome exato do acessório (sem diferenciar maiúsculas); se não existir, procura por parte do nome
 * e só avança se encontrar UM acessório.
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const arg = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const CONFIRM = argv.includes('--confirm')
const ITEM = (arg('--item') ?? '').trim()
const DATE = arg('--date') ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  if (!ITEM) throw new Error('Uso: npx tsx scripts/undo-accessory-counts.ts --item "Nome do acessório" [--date AAAA-MM-DD] [--confirm]')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error('Data inválida (AAAA-MM-DD).')
  let items = await sql<{ id: string; name: string }[]>`select id, name from accessory_stock_items where lower(btrim(name)) = lower(${ITEM})`
  if (!items.length) items = await sql<{ id: string; name: string }[]>`select id, name from accessory_stock_items where name ilike ${'%' + ITEM + '%'} order by name`
  if (!items.length) throw new Error(`Acessório não encontrado: ${ITEM}`)
  if (items.length > 1) throw new Error(`Há ${items.length} acessórios com "${ITEM}" no nome — indique o nome exato: ${items.map((i) => i.name).join(' | ')}`)
  const item = items[0]
  const rows = await sql<{ id: string; warehouse: string; quantity: number; created_by: string | null; created_at: string; before: number | null }[]>`
    select m.id, coalesce(w.name, 'Sem armazém') as warehouse, m.quantity, m.created_by, to_char(m.created_at at time zone 'Europe/Lisbon', 'HH24:MI') as created_at,
           (select s.quantity from accessory_stock s where s.item_id = m.item_id and s.warehouse_id is not distinct from m.warehouse_id) as before
    from accessory_movements m left join warehouses w on w.id = m.warehouse_id
    where m.item_id = ${item.id} and m.kind = 'contagem' and m.moved_at = ${DATE}::date
    order by 2`
  console.log(`Acessório: ${item.name} · contagens de ${DATE.split('-').reverse().join('/')}: ${rows.length}`)
  for (const r of rows) console.log(`  ${r.warehouse}: contagem ${r.quantity} (stock atual ${r.before ?? 0}) · ${r.created_by ?? '—'} às ${r.created_at}`)
  if (!rows.length) return
  if (!CONFIRM) { console.log('\nNada foi alterado. Para anular estas contagens: --confirm'); return }
  await sql`delete from accessory_movements where id = any(${rows.map((r) => r.id)}) and kind = 'contagem'`
  const after = await sql<{ warehouse: string; quantity: number }[]>`
    select coalesce(w.name, 'Sem armazém') as warehouse, s.quantity from accessory_stock s left join warehouses w on w.id = s.warehouse_id
    where s.item_id = ${item.id} order by 1`
  console.log(`\n${rows.length} contagem(ns) anulada(s). Stock de ${item.name} agora:`)
  for (const a of after) console.log(`  ${a.warehouse}: ${a.quantity}`)
}
main().then(() => sql.end(), async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
