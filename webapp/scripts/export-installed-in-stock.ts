/**
 * Excel com os IMEIs que estão em stock na app mas que a Intranet mostra instalados numa viatura de cliente
 * (sem intervenção registada que os tire do stock). Para validar com os técnicos.
 *   npx tsx scripts/export-installed-in-stock.ts   → cria instalados-em-stock-AAAA-MM-DD.xlsx nesta pasta
 * Só leitura: não altera nada na BD.
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
import ExcelJS from 'exceljs'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<Record<string, string | null>[]>`
    select c.imei, w.name as armazem, c.modality as modalidade, e.name as equipamento, d.model as hardware,
           c.moved_at::text as em_stock_desde, c.kind as ultimo_movimento,
           d.license_plate as matricula_intranet, dc.name as cliente_intranet,
           (select max(i.intervention_date)::text from interventions i
             where upper(replace(i.license_plate, '-', '')) = upper(replace(d.license_plate, '-', ''))) as ultima_interv_matricula,
           (select string_agg(distinct i2.imei, ', ') from interventions i2
             where upper(replace(i2.license_plate, '-', '')) = upper(replace(d.license_plate, '-', ''))
               and i2.imei is not null and i2.imei <> c.imei) as outros_imeis_registados_na_matricula
    from stock_current c
    join warehouses w on w.id = c.warehouse_id
    left join equipment_list e on e.id = c.equipment_id
    join devices d on d.imei = c.imei
    left join clients dc on dc.id = d.client_id
    where w.type <> 'mobilizado'
      and d.active and nullif(btrim(d.license_plate), '') is not null
      and not gestao_interv.is_internal_account(d.intranet_account_id)
    order by w.name, dc.name, d.license_plate`

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Instalados em stock')
  ws.columns = [
    { header: 'IMEI', key: 'imei', width: 18 },
    { header: 'Armazém (app)', key: 'armazem', width: 28 },
    { header: 'Venda/Aluguer', key: 'modalidade', width: 13 },
    { header: 'Equipamento', key: 'equipamento', width: 14 },
    { header: 'Hardware (Intranet)', key: 'hardware', width: 28 },
    { header: 'Em stock desde', key: 'em_stock_desde', width: 14 },
    { header: 'Último movimento', key: 'ultimo_movimento', width: 20 },
    { header: 'Matrícula (Intranet)', key: 'matricula_intranet', width: 16 },
    { header: 'Cliente (Intranet)', key: 'cliente_intranet', width: 32 },
    { header: 'Última intervenção nesta matrícula', key: 'ultima_interv_matricula', width: 18 },
    { header: 'Outros IMEIs registados na matrícula', key: 'outros_imeis_registados_na_matricula', width: 36 },
    { header: 'Observações (técnico)', key: 'obs', width: 40 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E5B67' } }
  ws.getRow(1).alignment = { wrapText: true, vertical: 'middle' }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  rows.forEach((r) => ws.addRow(r))
  ws.autoFilter = { from: 'A1', to: 'L1' }
  ws.getColumn('imei').numFmt = '@'

  const out = `instalados-em-stock-${new Date().toISOString().slice(0, 10)}.xlsx`
  await wb.xlsx.writeFile(out)
  console.log(`${rows.length} IMEIs → ${out}`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
