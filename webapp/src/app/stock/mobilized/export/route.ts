import ExcelJS from 'exceljs'
import { can } from '@/lib/permissions'
import { getCurrentUser } from '@/lib/auth'
import { getMobilizedItems } from '@/actions/stock'
import { filterMobilized, NO_CLIENT } from '@/lib/mobilized'

/**
 * Exporta o Mobilizado por cliente para Excel, com os filtros da página (?client=…&eq=…):
 * folha "Cliente × equipamento" (a matriz, com totais) e folha "IMEIs" (um IMEI por linha).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user || !can(user, 'stock')) return new Response('Sem permissão', { status: 403 })
  const q = new URL(request.url).searchParams
  const items = filterMobilized(await getMobilizedItems(), { client: q.get('client'), eq: q.get('eq') })

  const byName = (a: string, b: string) => a.localeCompare(b, 'pt')
  const equipments = [...new Set(items.map((i) => i.equipment))].sort(byName)
  const clients = new Map<string, string>()
  for (const i of items) clients.set(i.client_id ?? NO_CLIENT, i.client ?? 'Sem cliente atribuído')
  const rows = [...clients].sort(([ka, a], [kb, b]) => (ka === NO_CLIENT ? 1 : kb === NO_CLIENT ? -1 : byName(a, b)))
  const count = new Map<string, number>()
  for (const i of items) { const k = `${i.client_id ?? NO_CLIENT}|${i.equipment}`; count.set(k, (count.get(k) ?? 0) + 1) }

  const wb = new ExcelJS.Workbook()
  wb.creator = user.email
  wb.created = new Date()
  const header = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1)
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF263646' } }
    ws.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }]
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } }
  }

  // matriz
  const m = wb.addWorksheet('Cliente × equipamento')
  m.columns = [{ header: 'Cliente (Intranet)', key: 'c', width: 40 }, ...equipments.map((e, i) => ({ header: e, key: `e${i}`, width: Math.max(12, Math.min(26, e.length + 2)) })), { header: 'Total', key: 't', width: 10 }]
  for (const [key, name] of rows) {
    const vals = equipments.map((e) => count.get(`${key}|${e}`) ?? null)
    m.addRow([name, ...vals, vals.reduce<number>((a, v) => a + (v ?? 0), 0)])
  }
  header(m)
  const tot = m.addRow(['Total', ...equipments.map((e) => items.filter((i) => i.equipment === e).length), items.length])
  tot.font = { bold: true }
  tot.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } } })

  // IMEIs
  const w = wb.addWorksheet('IMEIs')
  w.columns = [
    { header: 'Cliente (Intranet)', key: 'client', width: 40 }, { header: 'Equipamento', key: 'eq', width: 24 }, { header: 'IMEI', key: 'imei', width: 18 },
    { header: 'Matrícula', key: 'plate', width: 16 }, { header: 'Venda / Aluguer', key: 'mod', width: 16 }, { header: 'Mobilizado desde', key: 'since', width: 16 },
    { header: 'Origem do cliente', key: 'via', width: 22 },
  ]
  const sorted = [...items].sort((a, b) => (a.client_id ? 0 : 1) - (b.client_id ? 0 : 1) || byName(a.client ?? '', b.client ?? '') || byName(a.equipment, b.equipment) || a.imei.localeCompare(b.imei))
  for (const i of sorted) {
    const row = w.addRow({
      client: i.client ?? 'Sem cliente atribuído', eq: i.equipment, imei: i.imei, plate: i.plate ?? '', mod: i.modality ?? '',
      since: new Date(`${i.moved_at.slice(0, 10)}T00:00:00Z`), via: i.via === 'intranet' ? 'Conta Intranet' : i.via === 'intervencao' ? 'Intervenção' : '',
    })
    row.getCell('imei').numFmt = '@'
    row.getCell('since').numFmt = 'dd/mm/yyyy'
  }
  header(w)

  const buf = await wb.xlsx.writeBuffer()
  const date = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="mobilizado_por_cliente_${date}.xlsx"`,
    },
  })
}
