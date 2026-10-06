/**
 * IMEIs no "Instalado Aluguer (Mobilizado)" que a Intranet mostra numa CONTA INTERNA Frotcom (= voltaram, retoma não registada).
 * Transfere-os para o armazém da app correspondente à conta interna (correção de stock, pode ser anulada no histórico).
 *
 *   npx tsx scripts/fix-mobilized-internal.ts                              → lista por conta, não altera nada
 *   npx tsx scripts/fix-mobilized-internal.ts --confirm                    → transfere só as contas com armazém definido
 *   npx tsx scripts/fix-mobilized-internal.ts --map "Storage Service=A2 - Stock Frotcom Aluguer" --map "RMA=RMA"
 *       (--map "parte do nome da conta=nome exato do armazém"; pode repetir)
 * Por omissão: conta com "RMA" → armazém "RMA". As restantes contas ficam no Mobilizado e são só listadas.
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const CONFIRM = argv.includes('--confirm')
const maps: [string, string][] = []
argv.forEach((a, i) => {
  if (a === '--map' && argv[i + 1]) {
    const [k, v] = argv[i + 1].split('=')
    if (k?.trim() && v?.trim()) maps.push([k.trim().toLowerCase(), v.trim()])
  }
})
if (!maps.length) maps.push(['rma', 'RMA'])
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const whs = await sql<{ id: string; name: string }[]>`select id, name from warehouses`
  const whByName = new Map(whs.map((w) => [w.name.trim().toLowerCase(), w]))
  for (const [, v] of maps) if (!whByName.has(v.toLowerCase())) throw new Error(`Armazém "${v}" não existe. Armazéns: ${whs.map((w) => w.name).join(' | ')}`)
  const [mob] = await sql<{ id: string }[]>`select gestao_interv.mobilized_wh() as id`

  const rows = await sql<{ imei: string; account: string; plate: string | null }[]>`
    select c.imei, coalesce(p.name, dc.name, d.intranet_account_id) as account, d.license_plate as plate
    from stock_current c
    join devices d on d.imei = c.imei
    left join clients dc on dc.id = d.client_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where c.warehouse_id = ${mob.id} and gestao_interv.is_internal_account(d.intranet_account_id)
    order by 2, 1`

  const target = (acc: string) => {
    const m = maps.find(([k]) => acc.toLowerCase().includes(k))
    return m ? whByName.get(m[1].toLowerCase())! : null
  }
  type R = { imei: string; account: string; plate: string | null }
  const byAcc = new Map<string, R[]>()
  for (const r of rows) byAcc.set(r.account, [...(byAcc.get(r.account) ?? []), r])
  console.log(`IMEIs no Mobilizado numa conta interna: ${rows.length}\n`)
  for (const [acc, list] of byAcc) {
    const t = target(acc)
    console.log(`  ${acc}: ${list.length}  → ${t ? t.name : 'fica no Mobilizado (sem armazém definido)'}`)
  }
  const todo = rows.filter((r) => target(r.account))
  if (!CONFIRM) { console.log(`\nA transferir: ${todo.length}. Nada foi alterado. Para transferir, corra de novo com --confirm`); return sql.end() }
  if (!todo.length) { console.log('\nNada a transferir.'); return sql.end() }

  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const ins = todo.map((r) => ({
    imei: r.imei, equipment_id: null, kind: 'transferencia', from_warehouse_id: mob.id, to_warehouse_id: target(r.account)!.id,
    modality: 'Aluguer', moved_at: today, is_correction: true,
    notes: `Retoma não registada (Intranet: ${r.account}${r.plate ? ` · ${r.plate}` : ''})`, created_by: 'script:fix-mobilized-internal',
  }))
  await sql.begin(async (tx) => {
    for (let i = 0; i < ins.length; i += 500) await tx`insert into stock_movements ${tx(ins.slice(i, i + 500))}`
  })
  console.log(`\nTransferidos ${ins.length} IMEIs do Mobilizado (data ${today}).`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
