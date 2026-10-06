/**
 * Excel com as intervenções cuja modalidade (Venda/Aluguer) é diferente da do cliente.
 * Inclui onde está hoje o IMEI instalado (Mobilizado = aluguer; fora do stock = venda) para ver o efeito no stock.
 *   npx tsx scripts/export-modality-mismatch.ts   → cria modalidade-divergente-AAAA-MM-DD.xlsx (só leitura)
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
import ExcelJS from 'exceljs'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<Record<string, string | null>[]>`
    select i.intervention_date::text as data, c.name as cliente, c.venda_aluguer as modalidade_cliente,
           i.venda_aluguer as modalidade_intervencao, it.name as tipo, i.license_plate as matricula,
           coalesce(nullif(btrim(i.spent_equipment_imei), ''), nullif(btrim(i.imei), '')) as imei,
           (select w.name from stock_current s join warehouses w on w.id = s.warehouse_id
             where s.imei = coalesce(nullif(btrim(i.spent_equipment_imei), ''), nullif(btrim(i.imei), ''))) as imei_hoje_em,
           'https://gestaointervencoes.up.railway.app/interventions/' || i.id as link
    from interventions i
    join clients c on c.id = i.client_id
    left join intervention_types it on it.id = i.intervention_type_id
    where gestao_interv.modality_of(c.venda_aluguer) is not null
      and gestao_interv.modality_of(i.venda_aluguer) is distinct from gestao_interv.modality_of(c.venda_aluguer)
    order by c.name, i.intervention_date desc`

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Modalidade divergente')
  ws.columns = [
    { header: 'Data', key: 'data', width: 12 }, { header: 'Cliente', key: 'cliente', width: 30 },
    { header: 'Modalidade cliente', key: 'modalidade_cliente', width: 16 }, { header: 'Modalidade intervenção', key: 'modalidade_intervencao', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 22 }, { header: 'Matrícula', key: 'matricula', width: 13 },
    { header: 'IMEI', key: 'imei', width: 18 }, { header: 'IMEI hoje em (app)', key: 'imei_hoje_em', width: 30 },
    { header: 'Abrir', key: 'link', width: 14 }, { header: 'Decisão / observações', key: 'obs', width: 36 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E5B67' } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  for (const r of rows) {
    const row = ws.addRow({ ...r, link: r.link ? { text: 'Abrir', hyperlink: r.link } : '' })
    row.getCell('imei').numFmt = '@'
    if (r.link) row.getCell('link').font = { color: { argb: 'FF0B79D0' }, underline: true }
  }
  ws.autoFilter = { from: 'A1', to: 'J1' }

  const out = `modalidade-divergente-${new Date().toISOString().slice(0, 10)}.xlsx`
  await wb.xlsx.writeFile(out)
  const byClient = new Set(rows.map((r) => r.cliente)).size
  console.log(`${rows.length} intervenções em ${byClient} clientes → ${out}`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
