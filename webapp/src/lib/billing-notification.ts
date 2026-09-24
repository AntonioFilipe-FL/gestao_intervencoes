import 'server-only'
import { sql } from '@/lib/db'
import { sendFromSender } from '@/lib/gmail'
import { senderEmail } from '@/lib/google'

/** Destinatário(s) — por omissão a financeira; pode ser alterado na variável BILLING_EMAIL_TO (separados por vírgula) */
export const billingRecipients = () =>
  (process.env.BILLING_EMAIL_TO || 'financeira@pt.frotcom.com').split(',').map(s => s.trim()).filter(Boolean)

/** "Faturar = Sim" (ignora maiúsculas/acentos) */
export const isBillable = (v: string | null | undefined) =>
  (v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase() === 'sim'

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const fmtDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—')

type Acc = { name: string; quantity: number }

/**
 * Envia à financeira o resumo da intervenção, a partir da conta do utilizador autenticado.
 * Nunca lança erro: devolve { ok, error } e regista o resultado na intervenção.
 */
export async function notifyBilling(interventionId: string, user: { email: string; name?: string }, appUrl: string) {
  try {
    const [i] = await sql`
      select i.*, c.name as client_name, c.venda_aluguer as client_va, t.name as tech_name, it.name as type_name,
        e.name as equipment_name, se.name as spent_equipment_name, re.name as return_equipment_name,
        b.name as bundle_name, ws.name as exit_wh, we.name as entry_wh,
        coalesce((select json_agg(json_build_object('name', ac.name, 'quantity', ia.quantity) order by ac.name)
          from intervention_accessories ia join accessories ac on ac.id = ia.accessory_id
          where ia.intervention_id = i.id and ia.direction = 'gasto'), '[]') as acc_spent,
        coalesce((select json_agg(json_build_object('name', ac.name, 'quantity', ia.quantity) order by ac.name)
          from intervention_accessories ia join accessories ac on ac.id = ia.accessory_id
          where ia.intervention_id = i.id and ia.direction = 'retomado'), '[]') as acc_returned
      from interventions i
      left join clients c on c.id = i.client_id
      left join technicians t on t.id = i.technician_id
      left join intervention_types it on it.id = i.intervention_type_id
      left join equipment_list e on e.id = i.equipment_id
      left join equipment_list se on se.id = i.spent_equipment_id
      left join equipment_list re on re.id = i.return_equipment_id
      left join bundles b on b.id = i.bundle_id
      left join warehouses ws on ws.id = i.stock_exit_warehouse_id
      left join warehouses we on we.id = i.stock_entry_warehouse_id
      where i.id = ${interventionId}`
    if (!i) throw new Error('Intervenção não encontrada')

    const link = `${appUrl}/interventions/${i.id}`
    const subject = `[Faturar] ${i.client_name ?? 'Sem cliente'} · ${i.type_name ?? 'Intervenção'} · ${fmtDate(i.intervention_date)}${i.license_plate ? ` · ${i.license_plate}` : ''}`

    const rows: [string, unknown][] = [
      ['Cliente', i.client_name],
      ['Venda / Aluguer', i.venda_aluguer ?? i.client_va],
      ['NOS / VDF', i.nos_vdf],
      ['Report / Projeto', i.report_projeto],
      ['Data da intervenção', fmtDate(i.intervention_date)],
      ['Técnico', i.tech_name],
      ['Tipo de intervenção', i.type_name],
      ['Matrícula', i.license_plate],
      ['IMEI', i.imei],
      ['Equipamento', i.equipment_name],
      ['Garantia / Aluguer', i.warranty_rental],
      ['Bundle', i.bundle_name],
      ['Motivo', i.motive_text],
      ['Ação efetuada', i.action_description],
    ]
    const accList = (items: Acc[]) =>
      items.length ? items.map(a => `${esc(a.name)} × ${a.quantity}`).join('<br>') : '—'
    const material: [string, string][] = [
      ['Equipamento gasto', esc(i.spent_equipment_name ?? '—') + (i.spent_equipment_imei ? ` (IMEI ${esc(i.spent_equipment_imei)})` : '')],
      ['Acessórios gastos', accList(i.acc_spent)],
      ['Armazém de saída', esc(i.exit_wh ?? '—')],
      ['Equipamento retomado', esc(i.return_equipment_name ?? '—')],
      ['Acessórios retomados', accList(i.acc_returned)],
      ['Armazém de entrada', esc(i.entry_wh ?? '—')],
    ]

    const tr = (k: string, v: string, odd: boolean) =>
      `<tr style="background:${odd ? '#fafafa' : '#ffffff'}"><td style="padding:8px 12px;color:#76808a;width:190px;border-bottom:1px solid #ededed">${esc(k)}</td><td style="padding:8px 12px;color:#263646;border-bottom:1px solid #ededed">${v}</td></tr>`
    const table = (title: string, data: [string, string][]) => `
      <div style="border:1px solid #d0d2d6;margin:0 0 16px">
        <div style="padding:10px 12px;font-weight:bold;text-transform:uppercase;font-size:13px;color:#263646;border-bottom:1px solid #d0d2d6">${esc(title)}</div>
        <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px">${data.map(([k, v], n) => tr(k, v, n % 2 === 0)).join('')}</table>
      </div>`

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Lato,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#263646">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-top:4px solid #cf0a2c;padding:20px">
        <p style="margin:0 0 4px;font-size:18px;line-height:24px;font-weight:bold;text-transform:uppercase">Intervenção para faturar</p>
        <p style="margin:0 0 16px;color:#76808a;font-size:12px">Registada por ${esc(user.name ? `${user.name} (${user.email})` : user.email)}</p>
        ${table('Intervenção', rows.map(([k, v]) => [k, esc(v ?? '—') || '—']))}
        ${table('Material', material)}
        ${table('Faturação', [['Observações', esc(i.billing_observations ?? '—')]])}
        <p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0081c9;color:#ffffff;text-decoration:none;text-transform:uppercase;font-size:11px;padding:6px 14px;border-radius:2px">Abrir registo</a></p>
      </div></body></html>`

    const text = [
      'INTERVENÇÃO PARA FATURAR', '',
      ...rows.map(([k, v]) => `${k}: ${v ?? '—'}`), '',
      `Equipamento gasto: ${i.spent_equipment_name ?? '—'}`,
      `Acessórios gastos: ${(i.acc_spent as Acc[]).map(a => `${a.name} x${a.quantity}`).join(', ') || '—'}`,
      `Equipamento retomado: ${i.return_equipment_name ?? '—'}`,
      `Acessórios retomados: ${(i.acc_returned as Acc[]).map(a => `${a.name} x${a.quantity}`).join(', ') || '—'}`,
      `Observações faturação: ${i.billing_observations ?? '—'}`, '',
      `Registo: ${link}`,
    ].join('\n')

    await sendFromSender({
      from: senderEmail(),
      fromName: process.env.BILLING_EMAIL_FROM_NAME || 'Frotcom Logística',
      replyTo: user.email, // respostas da financeira vão para quem registou
      to: billingRecipients(),
      subject, html, text,
    })
    await sql`update interventions set billing_notified_at = now(), billing_notified_by = ${user.email}, billing_notify_error = null
              where id = ${interventionId}`
    return { ok: true as const }
  } catch (e) {
    const error = (e as Error).message
    console.error('Falha no email à financeira:', error)
    await sql`update interventions set billing_notify_error = ${error.slice(0, 500)} where id = ${interventionId}`.catch(() => {})
    return { ok: false as const, error }
  }
}
