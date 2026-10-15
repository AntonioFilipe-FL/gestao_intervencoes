/**
 * Lista (só leitura) as matrículas a definir na Intranet para os equipamentos em stock dos técnicos:
 * armazém RL → "RL_" + últimos 7 dígitos do IMEI (idem RN, LS).
 *   npx tsx scripts/preview-tech-plates.ts            → resumo no ecrã + Excel matriculas-tecnicos-AAAA-MM-DD.xlsx
 *   npx tsx scripts/preview-tech-plates.ts RL RN      → só esses armazéns
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
import ExcelJS from 'exceljs'
dotenv.config({ path: '.env.local' })

const WH = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const WAREHOUSES = (WH.length ? WH : ['RL', 'RN', 'LS']).map((w) => w.toUpperCase())
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<{ warehouse: string; imei: string; plate: string | null; account: string | null; internal: boolean | null; vid: string | null; in_intranet: boolean }[]>`
    select w.name as warehouse, c.imei, nullif(btrim(d.license_plate), '') as plate,
           coalesce(dc.intranet_short_name, dc.name, p.name) as account,
           gestao_interv.is_internal_account(d.intranet_account_id) as internal,
           d.intranet_device_id as vid, (d.imei is not null) as in_intranet
    from stock_current c
    join warehouses w on w.id = c.warehouse_id
    left join devices d on d.imei = c.imei
    left join clients dc on dc.intranet_account_id = d.intranet_account_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where upper(btrim(w.name)) = any(${WAREHOUSES})
    order by w.name, c.imei`

  const res = rows.map((r) => {
    const target = `${r.warehouse.trim().toUpperCase()}_${r.imei.slice(-7)}`
    const estado = !r.in_intranet ? 'Não existe na Intranet'
      : r.internal === false ? 'Numa conta de CLIENTE — não mexer'
      : r.plate === target ? 'Já está certo'
      : 'A alterar'
    return { ...r, target, estado }
  })
  const count = new Map<string, number>()
  for (const r of res) count.set(`${r.warehouse} · ${r.estado}`, (count.get(`${r.warehouse} · ${r.estado}`) ?? 0) + 1)
  console.log(`Armazéns: ${WAREHOUSES.join(', ')} · IMEIs em stock: ${res.length}`)
  for (const [k, n] of [...count].sort()) console.log(`  ${k}: ${n}`)
  for (const r of res.filter((x) => x.estado === 'A alterar').slice(0, 15)) console.log(`  ${r.imei}  ${r.plate ?? '(sem matrícula)'} → ${r.target}  [${r.account ?? '—'}]`)

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Matrículas')
  ws.columns = [
    { header: 'Armazém', key: 'warehouse', width: 10 }, { header: 'IMEI', key: 'imei', width: 18 },
    { header: 'Matrícula atual (Intranet)', key: 'plate', width: 26 }, { header: 'Matrícula nova', key: 'target', width: 16 },
    { header: 'Conta (Intranet)', key: 'account', width: 34 }, { header: 'Estado', key: 'estado', width: 32 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E5B67' } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  for (const r of res) ws.addRow(r).getCell('imei').numFmt = '@'
  ws.autoFilter = { from: 'A1', to: 'F1' }
  const out = `matriculas-tecnicos-${new Date().toISOString().slice(0, 10)}.xlsx`
  await wb.xlsx.writeFile(out)
  console.log(`→ ${out} (nada foi alterado)`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
