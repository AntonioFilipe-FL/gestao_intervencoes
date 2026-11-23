import 'server-only'
import { sql } from '@/lib/db'
import { sendFromSender } from '@/lib/gmail'
import { senderEmail } from '@/lib/google'

/** Destinatário(s) do email ao suporte — variável SUPPORT_EMAIL_TO (separados por vírgula) */
export const supportRecipients = () =>
  (process.env.SUPPORT_EMAIL_TO || 'suporte@pt.frotcom.com').split(',').map((s) => s.trim()).filter(Boolean)

/** Envio ao suporte ligado/desligado (Configurações › Email). Por omissão: ligado. */
export async function isSupportEmailEnabled() {
  const [r] = await sql<{ value: string | null }[]>`select value from app_settings where key = 'support_email_enabled'`
  return r?.value !== 'off'
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const fmtDate = (d: string | Date | null) => (!d ? '—' : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10)).split('-').reverse().join('/'))

/**
 * Envia ao suporte as Observações Gerais da intervenção (com o resumo do registo), a partir da conta de envio.
 * Nunca lança erro: devolve { ok, error } e regista o resultado na intervenção.
 */
export async function notifySupport(interventionId: string, user: { email: string; name?: string }, appUrl: string) {
  try {
    const [i] = await sql`
      select i.*, c.name as client_name, t.name as tech_name, it.name as type_name, e.name as equipment_name
      from interventions i
      left join clients c on c.id = i.client_id
      left join technicians t on t.id = i.technician_id
      left join intervention_types it on it.id = i.intervention_type_id
      left join equipment_list e on e.id = i.equipment_id
      where i.id = ${interventionId}`
    if (!i) throw new Error('Intervenção não encontrada')
    if (!String(i.observations ?? '').trim()) throw new Error('As Observações Gerais estão vazias — não há nada a enviar ao suporte.')

    const link = `${appUrl}/interventions/${i.id}`
    const subject = `[Suporte] ${i.client_name ?? 'Sem cliente'} · ${i.type_name ?? 'Intervenção'} · ${fmtDate(i.intervention_date)}${i.license_plate ? ` · ${i.license_plate}` : ''}`
    const rows: [string, unknown][] = [
      ['Cliente', i.client_name], ['Data da intervenção', fmtDate(i.intervention_date)], ['Técnico', i.tech_name],
      ['Tipo de intervenção', i.type_name], ['Matrícula', i.license_plate], ['IMEI', i.imei], ['Equipamento', i.equipment_name],
      ['Conta Intranet', i.intranet_account], ['Matrícula Intranet', i.intranet_license_plate], ['Ticket', i.ticket],
      ['Ação efetuada', i.action_description],
    ]
    const obsHtml = esc(i.observations).replace(/\n/g, '<br>')
    const tr = (k: string, v: unknown, odd: boolean) =>
      `<tr style="background:${odd ? '#fafafa' : '#ffffff'}"><td style="padding:8px 12px;color:#76808a;width:190px;border-bottom:1px solid #ededed">${esc(k)}</td><td style="padding:8px 12px;color:#263646;border-bottom:1px solid #ededed">${esc(v ?? '—') || '—'}</td></tr>`
    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f5;font-family:Lato,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#263646">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border-top:4px solid #cf0a2c;padding:20px">
        <p style="margin:0 0 4px;font-size:18px;line-height:24px;font-weight:bold;text-transform:uppercase">Intervenção — informação para o suporte</p>
        <p style="margin:0 0 16px;color:#76808a;font-size:12px">Registada por ${esc(user.name ? `${user.name} (${user.email})` : user.email)}</p>
        <div style="border:1px solid #d0d2d6;border-left:4px solid #0081c9;margin:0 0 16px;padding:12px">
          <div style="font-weight:bold;text-transform:uppercase;font-size:13px;margin:0 0 6px">Observações gerais</div>
          <div>${obsHtml}</div>
        </div>
        <div style="border:1px solid #d0d2d6;margin:0 0 16px">
          <div style="padding:10px 12px;font-weight:bold;text-transform:uppercase;font-size:13px;border-bottom:1px solid #d0d2d6">Intervenção</div>
          <table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;font-size:13px">${rows.map(([k, v], n) => tr(k, v, n % 2 === 0)).join('')}</table>
        </div>
        <p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;background:#0081c9;color:#ffffff;text-decoration:none;text-transform:uppercase;font-size:11px;padding:6px 14px;border-radius:2px">Abrir registo</a></p>
      </div></body></html>`
    const text = ['INTERVENÇÃO — INFORMAÇÃO PARA O SUPORTE', '', 'Observações gerais:', String(i.observations), '',
      ...rows.map(([k, v]) => `${k}: ${v ?? '—'}`), '', `Registo: ${link}`].join('\n')

    await sendFromSender({
      from: senderEmail(),
      fromName: process.env.BILLING_EMAIL_FROM_NAME || 'Frotcom Logística',
      replyTo: user.email, // respostas do suporte vão para quem registou
      to: supportRecipients(), subject, html, text,
    })
    await sql`update interventions set support_notified_at = now(), support_notified_by = ${user.email}, support_notify_error = null where id = ${interventionId}`
    return { ok: true as const }
  } catch (e) {
    const error = (e as Error).message
    console.error('Falha no email ao suporte:', error)
    await sql`update interventions set support_notify_error = ${error.slice(0, 500)} where id = ${interventionId}`.catch(() => {})
    return { ok: false as const, error }
  }
}
