import ExcelJS from 'exceljs'
import { sql } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

/**
 * Exporta o stock para Excel: uma folha por armazém (ou só o armazém indicado em ?wh=),
 * mais uma folha "Resumo". Indica Venda/Aluguer e se a Intranet mostra o IMEI instalado numa viatura.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (user?.role !== 'admin') return new Response('Sem permissão', { status: 403 })
  const wh = new URL(request.url).searchParams.get('wh')
  const whId = wh && /^[0-9a-f-]{36}$/i.test(wh) ? wh : null

  const rows = await sql<{
    warehouse: string; imei: string; equipment: string | null; hardware: string | null; modality: string | null
    moved_at: string; kind: string; plate: string | null; client: string | null
  }[]>`
    select w.name as warehouse, c.imei, e.name as equipment, d.model as hardware, c.modality, c.moved_at::text, c.kind,
           case when d.active and nullif(btrim(d.license_plate), '') is not null
                 and not gestao_interv.is_internal_account(d.intranet_account_id) then d.license_plate end as plate,
           case when d.active and nullif(btrim(d.license_plate), '') is not null
                 and not gestao_interv.is_internal_account(d.intranet_account_id) then coalesce(dc.name, p.name) end as client
    from stock_current c
    join warehouses w on w.id = c.warehouse_id
    left join equipment_list e on e.id = c.equipment_id
    left join devices d on d.imei = c.imei
    left join clients dc on dc.id = d.client_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where ${whId ? sql`c.warehouse_id = ${whId}` : sql`true`}
    order by w.name, e.name nulls last, c.imei`

  const KIND: Record<string, string> = {
    rececao: 'Receção', transferencia: 'Transferência', intervencao_saida: 'Saída (intervenção)',
    intervencao_entrada: 'Entrada (retoma)', ajuste: 'Ajuste',
  }
  const wb = new ExcelJS.Workbook()
  wb.creator = user.email
  wb.created = new Date()

  const header = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1)
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263646' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
  }

  // Resumo
  type Row = (typeof rows)[number]
  const groups = new Map<string, Row[]>()
  for (const r of rows) groups.set(r.warehouse, [...(groups.get(r.warehouse) ?? []), r])
  const sum = wb.addWorksheet('Resumo')
  sum.columns = [
    { header: 'Armazém', key: 'wh', width: 24 }, { header: 'Total', key: 't', width: 10 },
    { header: 'Venda', key: 'v', width: 10 }, { header: 'Aluguer', key: 'a', width: 10 },
    { header: 'Sem modalidade', key: 's', width: 16 }, { header: 'Instalados na Intranet', key: 'i', width: 22 },
  ]
  for (const [name, list] of groups)
    sum.addRow({
      wh: name, t: list.length, v: list.filter((r) => r.modality === 'Venda').length,
      a: list.filter((r) => r.modality === 'Aluguer').length, s: list.filter((r) => !r.modality).length,
      i: list.filter((r) => r.plate).length,
    })
  header(sum)

  // Uma folha por armazém
  for (const [name, list] of groups) {
    const ws = wb.addWorksheet(name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31))
    ws.columns = [
      { header: 'IMEI', key: 'imei', width: 18 }, { header: 'Equipamento', key: 'eq', width: 22 },
      { header: 'Hardware (Intranet)', key: 'hw', width: 28 }, { header: 'Venda / Aluguer', key: 'mod', width: 16 },
      { header: 'Em stock desde', key: 'since', width: 15 }, { header: 'Último movimento', key: 'kind', width: 20 },
      { header: 'Estado', key: 'state', width: 26 }, { header: 'Matrícula (Intranet)', key: 'plate', width: 20 },
      { header: 'Cliente (Intranet)', key: 'client', width: 32 },
    ]
    for (const r of list) {
      const row = ws.addRow({
        imei: r.imei, eq: r.equipment ?? '', hw: r.hardware ?? '', mod: r.modality ?? '',
        since: new Date(`${r.moved_at.slice(0, 10)}T00:00:00Z`), kind: KIND[r.kind] ?? r.kind,
        state: r.plate ? 'Instalado (segundo a Intranet)' : 'Em stock', plate: r.plate ?? '', client: r.client ?? '',
      })
      row.getCell('imei').numFmt = '@'
      row.getCell('since').numFmt = 'dd/mm/yyyy'
      if (r.plate) row.getCell('state').font = { color: { argb: 'FFC7830B' }, bold: true }
    }
    header(ws)
  }
  if (groups.size === 0) wb.addWorksheet('Sem stock').addRow(['Não há equipamentos em stock.'])

  const buf = await wb.xlsx.writeBuffer()
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const tag = whId && rows[0] ? rows[0].warehouse.replace(/[^\w-]+/g, '_') : 'todos'
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="stock_${tag}_${date}.xlsx"`,
    },
  })
}
