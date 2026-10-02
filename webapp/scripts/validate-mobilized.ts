/**
 * Valida o armazém "Instalado Aluguer (Mobilizado)" contra a Intranet e gera um Excel com o que não bate certo:
 *   - NÃO instalado na Intranet (sem matrícula, inativo, ou numa conta interna Frotcom) → provável retoma não registada
 *   - instalado noutra matrícula diferente da última intervenção → provável troca/reinstalação não registada
 *   - não existe na Intranet
 *   npx tsx scripts/validate-mobilized.ts   → cria mobilizado-validacao-AAAA-MM-DD.xlsx (só leitura, não altera a BD)
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
import ExcelJS from 'exceljs'
dotenv.config({ path: '.env.local' })

const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const rows = await sql<Record<string, string | null>[]>`
    with mob as (
      select c.imei, c.moved_at, c.intervention_id, c.equipment_id from stock_current c
      where c.warehouse_id = gestao_interv.mobilized_wh()
    )
    select m.imei, e.name as equipamento, m.moved_at::text as mobilizado_desde,
           i.intervention_date::text as data_interv, it.name as tipo_interv, i.license_plate as matricula_registo, ic.name as cliente_registo,
           d.license_plate as matricula_intranet, coalesce(dc.name, p.name) as conta_intranet,
           case
             when d.imei is null then 'Não existe na Intranet'
             when not d.active then 'Inativo na Intranet'
             when gestao_interv.is_internal_account(d.intranet_account_id) then 'Numa conta interna Frotcom (provável retoma não registada)'
             when nullif(btrim(d.license_plate), '') is null then 'Sem matrícula na Intranet'
             when i.license_plate is not null and gestao_interv.plate_norm(i.license_plate) <> gestao_interv.plate_norm(d.license_plate)
               then 'Instalado noutra matrícula'
           end as problema
    from mob m
    left join equipment_list e on e.id = m.equipment_id
    left join interventions i on i.id = m.intervention_id
    left join intervention_types it on it.id = i.intervention_type_id
    left join clients ic on ic.id = i.client_id
    left join devices d on d.imei = m.imei
    left join clients dc on dc.id = d.client_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id`
  const bad = rows.filter((r) => r.problema)
  const count = new Map<string, number>()
  for (const r of bad) count.set(r.problema!, (count.get(r.problema!) ?? 0) + 1)

  const wb = new ExcelJS.Workbook()
  const sum = wb.addWorksheet('Resumo')
  sum.addRow(['IMEIs no Mobilizado', rows.length])
  sum.addRow(['Bate certo com a Intranet', rows.length - bad.length])
  sum.addRow([])
  for (const [k, n] of count) sum.addRow([k, n])
  sum.getColumn(1).width = 60

  const ws = wb.addWorksheet('Por verificar')
  ws.columns = [
    { header: 'Problema', key: 'problema', width: 50 }, { header: 'IMEI', key: 'imei', width: 18 },
    { header: 'Equipamento', key: 'equipamento', width: 14 }, { header: 'Mobilizado desde', key: 'mobilizado_desde', width: 14 },
    { header: 'Última intervenção', key: 'data_interv', width: 14 }, { header: 'Tipo', key: 'tipo_interv', width: 18 },
    { header: 'Matrícula (registo)', key: 'matricula_registo', width: 16 }, { header: 'Cliente (registo)', key: 'cliente_registo', width: 28 },
    { header: 'Matrícula (Intranet)', key: 'matricula_intranet', width: 18 }, { header: 'Conta (Intranet)', key: 'conta_intranet', width: 32 },
    { header: 'Observações', key: 'obs', width: 40 },
  ]
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4E5B67' } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  bad.sort((a, b) => (a.problema! + a.imei).localeCompare(b.problema! + b.imei)).forEach((r) => ws.addRow(r))
  ws.autoFilter = { from: 'A1', to: 'K1' }

  const out = `mobilizado-validacao-${new Date().toISOString().slice(0, 10)}.xlsx`
  await wb.xlsx.writeFile(out)
  console.log(`Mobilizado: ${rows.length} IMEIs | bate certo: ${rows.length - bad.length} | por verificar: ${bad.length}`)
  for (const [k, n] of count) console.log(`  ${k}: ${n}`)
  console.log(`→ ${out}`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
