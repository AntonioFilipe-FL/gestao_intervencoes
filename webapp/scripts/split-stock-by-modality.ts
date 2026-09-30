/**
 * Passa os IMEIs em stock num armazém (por omissão "Stock Frotcom") para dois armazéns conforme a modalidade:
 * Venda → armazém de venda (A1), Aluguer → armazém de aluguer (A2). Os "sem modalidade" ficam onde estão.
 * Regista TRANSFERÊNCIAS normais (aparecem no histórico e podem ser anuladas uma a uma).
 *   npx tsx scripts/split-stock-by-modality.ts --venda "A1 - Stock Frotcom Venda" --aluguer "A2 - Stock Frotcom Aluguer"            → só mostra
 *   npx tsx scripts/split-stock-by-modality.ts --venda "A1 - …" --aluguer "A2 - …" --confirm                                      → transfere
 *   opcional: --origem "Stock Frotcom"   --data 2026-09-30
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const CONFIRM = argv.includes('--confirm')
const ORIGEM = opt('--origem') ?? 'Stock Frotcom'
const VENDA = opt('--venda'), ALUGUER = opt('--aluguer')
const DATA = opt('--data') ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function wh(name: string | undefined, label: string) {
  if (!name) throw new Error(`Indique ${label}.`)
  const r = await sql<{ id: string; name: string }[]>`select id, name from warehouses where lower(btrim(name)) = lower(btrim(${name}))`
  if (!r.length) {
    const all = await sql<{ name: string }[]>`select name from warehouses order by name`
    throw new Error(`Armazém "${name}" não existe. Armazéns: ${all.map((a) => a.name).join(' | ')}`)
  }
  return r[0]
}

async function main() {
  const from = await wh(ORIGEM, '--origem')
  const toV = await wh(VENDA, '--venda "Nome do A1"')
  const toA = await wh(ALUGUER, '--aluguer "Nome do A2"')
  const items = await sql<{ imei: string; modality: string | null }[]>`
    select imei, modality from stock_current where warehouse_id = ${from.id}`
  const venda = items.filter((i) => i.modality === 'Venda')
  const aluguer = items.filter((i) => i.modality === 'Aluguer')
  const sem = items.length - venda.length - aluguer.length
  console.log(`Em "${from.name}": ${items.length} IMEIs`)
  console.log(`  Venda   → "${toV.name}": ${venda.length}`)
  console.log(`  Aluguer → "${toA.name}": ${aluguer.length}`)
  console.log(`  Sem modalidade (ficam em "${from.name}"): ${sem}`)
  if (!CONFIRM) { console.log('\nNada foi alterado. Para transferir, corra de novo com --confirm'); return sql.end() }

  const row = (imei: string, to: string, modality: string) => ({
    imei, equipment_id: null, kind: 'transferencia', from_warehouse_id: from.id, to_warehouse_id: to, modality,
    moved_at: DATA, notes: 'Separação automática Venda/Aluguer', created_by: 'script:split-stock-by-modality',
  })
  const rows = [...venda.map((i) => row(i.imei, toV.id, 'Venda')), ...aluguer.map((i) => row(i.imei, toA.id, 'Aluguer'))]
  await sql.begin(async (tx) => {
    for (let i = 0; i < rows.length; i += 500) await tx`insert into stock_movements ${tx(rows.slice(i, i + 500))}`
  })
  console.log(`\nTransferidos ${rows.length} IMEIs (data ${DATA}).`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
