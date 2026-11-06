import ExcelJS from 'exceljs'
import { getCurrentUser } from '@/lib/auth'
import { can } from '@/lib/permissions'
import { getInterventionsForExport } from '@/services/database'

export const dynamic = 'force-dynamic'

type Acc = { name: string; quantity: number }
const s = (v: unknown) => (v === null || v === undefined ? '' : String(v))
const accText = (a: unknown) => ((a as Acc[]) ?? []).map((x) => `${x.quantity}× ${x.name}`).join('; ')
const legacy = (r: Record<string, unknown>, k: string) => [1, 2, 3, 4, 5].map((n) => s(r[`${k}_${n}`])).filter(Boolean).join('; ')
const day = (v: unknown) => (v ? new Date(`${String(v instanceof Date ? v.toISOString() : v).slice(0, 10)}T00:00:00Z`) : null)

/**
 * Exporta para Excel as intervenções do filtro atual (mesmos parâmetros da lista).
 * Folha "Intervenções" (toda a informação) + folha "Material" (uma linha por equipamento/acessório gasto ou retomado).
 */
export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user || !can(user, 'interventions')) return new Response('Sem permissão', { status: 403 })
  const q = new URL(request.url).searchParams
  const fat = q.get('fat') ?? ''
  const mod = q.get('mod') ?? ''
  const rows = await getInterventionsForExport({
    clientSearch: q.get('client') ?? '', techSearch: q.get('tech') ?? '', plateSearch: q.get('plate') ?? '',
    dateFrom: q.get('from') ?? '', dateTo: q.get('to') ?? '',
    billingFilter: ['faturar', 'pendente', 'processado'].includes(fat) ? fat : '',
    modalityFilter: mod === 'Venda' || mod === 'Aluguer' ? mod : '',
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Intervenções', { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = [
    { header: 'Data intervenção', key: 'date', width: 13 }, { header: 'Data registo', key: 'reg', width: 13 },
    { header: 'Técnico', key: 'tech', width: 10 }, { header: 'Cliente', key: 'client', width: 28 },
    { header: 'Venda/Aluguer', key: 'va', width: 12 }, { header: 'NOS/VDF', key: 'nos', width: 9 },
    { header: 'Tipo', key: 'type', width: 24 }, { header: 'Matrícula', key: 'plate', width: 12 },
    { header: 'IMEI', key: 'imei', width: 18 }, { header: 'Equipamento', key: 'eq', width: 16 },
    { header: 'IMEIs adicionais', key: 'extra', width: 24 },
    { header: 'Motivo', key: 'motive', width: 24 }, { header: 'Descrição', key: 'desc', width: 40 },
    { header: 'Equipamento gasto', key: 'seq', width: 16 }, { header: 'IMEI gasto', key: 'simei', width: 18 },
    { header: 'Acessórios gastos', key: 'sacc', width: 40 },
    { header: 'Equipamento retomado', key: 'req', width: 16 }, { header: 'IMEI retomado', key: 'rimei', width: 18 },
    { header: 'Modalidade retoma', key: 'rmod', width: 12 }, { header: 'Acessórios retomados', key: 'racc', width: 40 },
    { header: 'Armazém saída', key: 'wout', width: 20 }, { header: 'Armazém entrada', key: 'win', width: 20 },
    { header: 'Garantia/Aluguer', key: 'war', width: 14 }, { header: 'Conta Intranet', key: 'acc', width: 22 },
    { header: 'Matrícula Intranet', key: 'iplate', width: 16 }, { header: 'Material assistido', key: 'assist', width: 20 },
    { header: 'Faturar', key: 'bill', width: 8 }, { header: 'Obs. faturação', key: 'bobs', width: 30 },
    { header: 'Processado em', key: 'bproc', width: 14 }, { header: 'Processado por', key: 'bby', width: 24 },
    { header: 'Bundle', key: 'bundle', width: 16 }, { header: 'Plataforma', key: 'plat', width: 14 },
    { header: 'Configuração', key: 'conf', width: 16 }, { header: 'CANbus via', key: 'can', width: 12 },
    { header: 'DTC tempo real', key: 'dtc', width: 12 }, { header: 'Serviços', key: 'serv', width: 20 },
    { header: 'Viatura CRM', key: 'crm', width: 16 }, { header: 'Adenda contrato', key: 'add', width: 14 },
    { header: 'Report/Projeto', key: 'rep', width: 16 }, { header: 'Observações', key: 'obs', width: 40 },
    { header: 'Validado por', key: 'val', width: 10 }, { header: 'Registado por', key: 'by', width: 26 },
  ]
  const mat = wb.addWorksheet('Material', { views: [{ state: 'frozen', ySplit: 1 }] })
  mat.columns = [
    { header: 'Data intervenção', key: 'date', width: 13 }, { header: 'Cliente', key: 'client', width: 28 },
    { header: 'Venda/Aluguer', key: 'va', width: 12 }, { header: 'Tipo intervenção', key: 'type', width: 24 },
    { header: 'Matrícula', key: 'plate', width: 12 }, { header: 'Técnico', key: 'tech', width: 10 },
    { header: 'Movimento', key: 'dir', width: 10 }, { header: 'Material', key: 'kind', width: 12 },
    { header: 'Nome', key: 'name', width: 28 }, { header: 'Quantidade', key: 'qty', width: 10 },
    { header: 'IMEI', key: 'imei', width: 18 }, { header: 'Armazém', key: 'wh', width: 20 },
  ]

  for (const r of rows) {
    const spentAcc = accText(r.acc_spent) || legacy(r, 'accessory_spent')
    const retAcc = accText(r.acc_returned) || legacy(r, 'accessory_return')
    const row = ws.addRow({
      date: day(r.intervention_date), reg: day(r.validation_date ?? r.created_at), tech: s(r.technician_name), client: s(r.client_name),
      va: s(r.venda_aluguer), nos: s(r.nos_vdf), type: s(r.type_name), plate: s(r.license_plate), imei: s(r.imei), eq: s(r.equipment_name),
      extra: s(r.extra_imeis), motive: s(r.motive_name ?? r.motive_text), desc: s(r.action_description),
      seq: s(r.spent_equipment_name ?? r.spent_equipment), simei: s(r.spent_equipment_imei), sacc: spentAcc,
      req: s(r.return_equipment_name ?? r.equipment_return), rimei: s(r.return_equipment_imei), rmod: s(r.return_modality), racc: retAcc,
      wout: s(r.exit_wh), win: s(r.entry_wh), war: s(r.warranty_rental), acc: s(r.intranet_account), iplate: s(r.intranet_license_plate),
      assist: s(r.assisted_material), bill: s(r.billing), bobs: s(r.billing_observations), bproc: day(r.billing_processed_at), bby: s(r.billing_processed_by),
      bundle: s(r.bundle_name), plat: s(r.platform_name), conf: s(r.configuration), can: s(r.canbus_via), dtc: s(r.dtc_active_realtime),
      serv: s(r.services_status ?? r.account_services), crm: s(r.crm_vehicle), add: s(r.contract_addendum), rep: s(r.report_projeto),
      obs: s(r.observations), val: s(r.validated_by_name), by: s(r.created_by),
    })
    for (const k of ['imei', 'simei', 'rimei']) row.getCell(k).numFmt = '@'
    for (const k of ['date', 'reg', 'bproc']) row.getCell(k).numFmt = 'dd/mm/yyyy'

    const base = { date: day(r.intervention_date), client: s(r.client_name), va: s(r.venda_aluguer), type: s(r.type_name), plate: s(r.license_plate), tech: s(r.technician_name) }
    const add = (o: Record<string, unknown>) => { const x = mat.addRow({ ...base, ...o }); x.getCell('date').numFmt = 'dd/mm/yyyy'; x.getCell('imei').numFmt = '@' }
    if (r.spent_equipment_imei || r.spent_equipment_name || r.spent_equipment)
      add({ dir: 'Gasto', kind: 'Equipamento', name: s(r.spent_equipment_name ?? r.spent_equipment), qty: 1, imei: s(r.spent_equipment_imei), wh: s(r.exit_wh) })
    for (const a of (r.acc_spent as Acc[]) ?? []) add({ dir: 'Gasto', kind: 'Acessório', name: a.name, qty: a.quantity, wh: s(r.exit_wh) })
    if (r.return_equipment_imei || r.return_equipment_name || r.equipment_return)
      add({ dir: 'Retomado', kind: 'Equipamento', name: s(r.return_equipment_name ?? r.equipment_return), qty: 1, imei: s(r.return_equipment_imei), wh: s(r.entry_wh) })
    for (const a of (r.acc_returned as Acc[]) ?? []) add({ dir: 'Retomado', kind: 'Acessório', name: a.name, qty: a.quantity, wh: s(r.entry_wh) })
  }
  for (const sh of [ws, mat]) {
    sh.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
    sh.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B3A4A' } }
    sh.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sh.columnCount } }
  }
  if (rows.length >= 20000) ws.addRow({ date: null, client: 'Limite de 20 000 intervenções atingido — reduza o período.' })

  const buf = await wb.xlsx.writeBuffer()
  const tag = [q.get('from'), q.get('to'), mod].filter(Boolean).join('_') || new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="intervencoes_${tag.replace(/[^\w-]+/g, '_')}.xlsx"`,
    },
  })
}
