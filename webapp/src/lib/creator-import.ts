import 'server-only'
import { sql } from '@/lib/db'

/**
 * Zoho Creator (só leitura): formulários dos técnicos no estado "Por validar" → intervenções por confirmar.
 * Variáveis: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_CREATOR_REFRESH_TOKEN (scope ZohoCreator.report.READ).
 */
const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.eu'
const API = process.env.ZOHO_API_URL || 'https://www.zohoapis.eu'
const OWNER = process.env.ZOHO_CREATOR_OWNER || 'frotcom'
const APP = process.env.ZOHO_CREATOR_APP || 'gest-o-de-agendas-e-formul-rios'
const SUMMARY = 'Envio_de_formul_rios_Report'
/** relatório com o formulário completo de cada tipo */
const REPORTS: Record<string, string> = {
  'Instalação': 'Formul_rio_de_instala_o_Report', 'Assistências': 'Formul_rio_de_assistencia_Report',
  'Troca de Viatura': 'Formul_rio_de_trocaViatura_Report', 'Upgrade': 'Formmul_rio_de_Upgrade_Report',
  'Reinstalação': 'Copy_of_Formul_rio_de_reinstala_o_Report', 'Desinstalação': 'Formul_rio_de_desinstala_o_Report',
  'Anomalia/Avaria': 'Formul_rio_de_anomalia_Report', 'Entrega/Recolha': 'Formul_rio_de_Entrega_Recolha_Report',
}
/** tipo de formulário → tipo de intervenção da app, quando o "Tipo de Intervenção" do Creator não existe na app */
const TYPE_FALLBACK: Record<string, string> = {
  'Instalação': 'Instalação', 'Assistências': 'Assistência', 'Troca de Viatura': 'Troca de Viatura', 'Upgrade': 'Upgrade',
  'Reinstalação': 'Reinstalação', 'Desinstalação': 'Desinstalação',
}

/** Link para abrir o formulário no Creator (registo do formulário do seu tipo; senão, o resumo em "Todos os formulários") */
export function creatorRecordUrl(formType: string | null, idRecord: string | null, creatorId: string) {
  const rep = formType ? REPORTS[formType] : undefined
  const base = `https://creatorapp.zoho.eu/${OWNER}/${APP}/record-summary`
  return rep && idRecord ? `${base}/${rep}/${idRecord}` : `${base}/${SUMMARY}/${creatorId}`
}

export const creatorConfigured = () =>
  !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_CREATOR_REFRESH_TOKEN)

type Rec = Record<string, unknown>

async function token() {
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: 'POST', cache: 'no-store', body: new URLSearchParams({
    grant_type: 'refresh_token', client_id: process.env.ZOHO_CLIENT_ID!, client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_CREATOR_REFRESH_TOKEN! }) })
  const j = await r.json().catch(() => ({}))
  if (!j.access_token) throw new Error(`Zoho Creator: não foi possível autenticar (${j.error ?? r.status})`)
  return j.access_token as string
}

const disp = (v: unknown): string => {
  if (v == null) return ''
  if (Array.isArray(v)) return v.map(disp).filter(Boolean).join(', ')
  if (typeof v === 'object') return String((v as Rec).zc_display_value ?? (v as Rec).display_value ?? '').trim()
  return String(v).trim()
}
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')
/** só dígitos; 14 dígitos → acrescenta o 0 inicial; outra coisa → '' */
const imeiOf = (v: unknown) => { const d = disp(v).replace(/\D/g, ''); return d.length === 15 ? d : d.length === 14 ? '0' + d : '' }
const MONTHS: Record<string, string> = { jan: '01', feb: '02', fev: '02', mar: '03', apr: '04', abr: '04', may: '05', mai: '05', jun: '06', jul: '07', aug: '08', ago: '08', sep: '09', set: '09', oct: '10', out: '10', nov: '11', dec: '12', dez: '12' }
/** "10-Nov-2026", "10/11/2026", "2026-11-10" (com ou sem hora) → "2026-11-10" */
function dateOf(v: unknown): string | null {
  const s = disp(v)
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[-/ ]([A-Za-zç]{3})[a-zç]*[-/ ](\d{4})/)
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

/**
 * Formulários por confirmar cuja intervenção JÁ foi registada na app (à mão): mesma data e mesmo IMEI ou matrícula.
 * Ficam resolvidos (ligados a essa intervenção) e deixam de aparecer para gravar outra vez. Devolve quantos.
 */
export async function resolveRegisteredDrafts() {
  const r = await sql`
    update intervention_drafts d set status = 'done', intervention_id = x.id, resolved_at = now(), resolved_by = 'auto: já registada'
    from (
      select distinct on (d2.id) d2.id as draft_id, i.id
      from intervention_drafts d2 join interventions i on i.intervention_date = d2.intervention_date
        and ((d2.imei is not null and d2.imei in (gestao_interv.imei_norm(i.imei), gestao_interv.imei_norm(i.spent_equipment_imei), gestao_interv.imei_norm(i.return_equipment_imei)))
          or (nullif(gestao_interv.plate_norm(d2.license_plate), '') is not null and gestao_interv.plate_norm(d2.license_plate) = gestao_interv.plate_norm(i.license_plate)))
      where d2.status = 'pending' order by d2.id, i.created_at
    ) x where d.id = x.draft_id and d.status = 'pending' returning d.id`
  return r.length
}

/** Lê os formulários "Por validar" e cria as intervenções por confirmar que ainda não existem. */
export async function importCreatorForms() {
  if (!creatorConfigured()) throw new Error('Falta a variável ZOHO_CREATOR_REFRESH_TOKEN (ou ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET).')
  const H = { Authorization: `Zoho-oauthtoken ${await token()}` }
  // resumo: todos os "Por validar" (paginado pelo cabeçalho record_cursor)
  const rows: Rec[] = []
  let cursor: string | null = null
  for (let page = 0; page < 10; page++) {
    const url = `${API}/creator/v2.1/data/${OWNER}/${APP}/report/${SUMMARY}?max_records=200&criteria=${encodeURIComponent('Estado == "Por validar"')}`
    const r: Response = await fetch(url, { headers: cursor ? { ...H, record_cursor: cursor } : H, cache: 'no-store' })
    if (r.status === 204) break
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { if (j.code === 9280 || j.code === 3100) break; throw new Error(`Zoho Creator: HTTP ${r.status} ${j.message ?? ''}`) }
    rows.push(...((j.data ?? []) as Rec[]))
    cursor = r.headers.get('record_cursor')
    if (!cursor) break
  }
  const pending = rows.filter((x) => /por validar/i.test(disp(x.Estado)))
  const known = new Set((await sql<{ creator_id: string }[]>`select creator_id from intervention_drafts where creator_id = any(${pending.map((x) => String(x.ID))})`).map((k) => k.creator_id))
  const todo = pending.filter((x) => !known.has(String(x.ID))).slice(0, 150)
  if (!todo.length) return { found: pending.length, created: 0, already: await resolveRegisteredDrafts(), errors: [] as string[] }

  const [techs, types, clients, whs] = await Promise.all([
    sql<{ id: string; name: string }[]>`select id, name from technicians where active`,
    sql<{ id: string; name: string }[]>`select id, name from intervention_types where active`,
    sql<{ id: string; name: string; short: string | null }[]>`select id, name, intranet_short_name as short from clients where active`,
    sql<{ id: string; name: string }[]>`select id, name from warehouses where active and type <> 'mobilizado'`,
  ])
  // técnico: nome igual, ou iniciais do nome do Creator (ex.: "Rui Nunes" → RN)
  const techOf = (name: string) => {
    const first = name.replace(/[[\]]/g, '').split(',')[0].trim()
    const ini = first.split(/\s+/).map((w) => w[0] ?? '').join('').toUpperCase()
    return techs.find((t) => fold(t.name) === fold(first)) ?? techs.find((t) => t.name.toUpperCase() === ini) ?? null
  }
  const typeOf = (...names: string[]) => { for (const n of names) { const t = n && types.find((x) => fold(x.name) === fold(n)); if (t) return t } return null }
  const clientOf = (...names: string[]) => { for (const n of names) { const c = n && clients.find((x) => fold(x.short ?? '') === fold(n) || fold(x.name) === fold(n)); if (c) return c } return null }

  let created = 0
  const errors: string[] = []
  for (const s of todo) {
    try {
      const formType = disp(s.Tipo_de_formul_rio)
      const rep = REPORTS[formType]
      let d: Rec = {}
      if (rep && s.IdRecord) {
        const r = await fetch(`${API}/creator/v2.1/data/${OWNER}/${APP}/report/${rep}/${s.IdRecord}`, { headers: H, cache: 'no-store' })
        const j = await r.json().catch(() => ({}))
        if (r.ok && j.data) d = j.data as Rec
      }
      const date = dateOf(s.Data_de_interven_o)
      const techName = disp(s.Tecnico).replace(/[[\]]/g, '')
      const tech = techOf(techName)
      const empresa = d.Empresa as Rec | undefined
      const client = clientOf(disp(empresa?.Nome_Intranet), disp(empresa), disp(s.Cliente))
      const type = typeOf(disp(s.Tipo_de_Interven_o), TYPE_FALLBACK[formType] ?? '')
      const plate = disp(d.Matr_cula) || disp(d.MatriculaDrop) || disp(s.Matricula)
      const installed = imeiOf(d.IMEI_do_equipamento_instalado), assisted = imeiOf(d.IMEI_do_equipamento_assistido), novo = imeiOf(d.IMEI_EquiNovo)
      const techWh = tech ? whs.find((w) => fold(w.name) === fold(tech.name))?.id ?? '' : ''
      const v: Record<string, string> = {}
      const set = (k: string, val: string | null | undefined) => { if (val) v[k] = val }
      set('intervention_date', date); set('technician_id', tech?.id); set('client_id', client?.id); set('intervention_type_id', type?.id)
      set('license_plate', plate)
      const ticket = disp(d.Ticket_field) || disp(s.N_do_Ticket)
      set('zoho_form', creatorRecordUrl(formType, s.IdRecord ? String(s.IdRecord) : null, String(s.ID)))
      set('ticket', ticket)
      if (/desinstala/i.test(formType)) {
        // equipamento retirado da viatura → entra no armazém do técnico
        set('imei', assisted); set('return_equipment_imei', assisted); set('stock_entry_warehouse_id', assisted ? techWh : '')
      } else if (novo) {
        // troca de equipamento (assistência / upgrade): sai o novo do armazém do técnico, entra o antigo
        set('imei', assisted || novo); set('spent_equipment_imei', novo); set('stock_exit_warehouse_id', techWh)
        if (assisted) { set('return_equipment_imei', assisted); set('stock_entry_warehouse_id', techWh) }
      } else if (installed) {
        // instalação / reinstalação: o equipamento instalado sai do armazém do técnico
        set('imei', installed)
        if (/^instala/i.test(formType)) { set('spent_equipment_imei', installed); set('stock_exit_warehouse_id', techWh) }
      } else set('imei', assisted)
      const desc = [disp(d.Resumo), disp(d.Observa_es), disp(d.Observacoes)].filter(Boolean).join('\n')
      set('action_description', desc.slice(0, 1900))

      // informação para o admin rever (o material vem em texto livre: os acessórios escolhem-se à mão)
      const notes: string[] = []
      const note = (label: string, val: unknown) => { const t = disp(val); if (t) notes.push(`${label}: ${t}`) }
      note('Tipo de formulário', formType); note('Tipo de intervenção (Creator)', s.Tipo_de_Interven_o); note('Técnico(s)', techName)
      note('Cliente (Creator)', disp(empresa) || s.Cliente); note('Ticket', ticket)
      note('Matrícula antiga', d.MatriculaAntiga); note('Tipo de instalação', d.TipoInstalacao)
      note('Equipamento substituído', d.Equipamento_substitu_do); note('Troca de equipamento', d.TrocaEquipamento)
      note('IMEI instalado', d.IMEI_do_equipamento_instalado); note('IMEI assistido', d.IMEI_do_equipamento_assistido); note('IMEI novo', d.IMEI_EquiNovo)
      note('Substituição de acessório', d.SubsAcessorio); note('Acessórios substituídos', d.AcessoriosSubs)
      note('Material gasto', d.MaterialGasto ?? d.MatGasto); note('Descrição/quantidades do material', d.DescricaoQtdMatGasto ?? d.DescrQtds)
      note('Ligações efetuadas', d.LigEfetuadas)
      if (!tech) notes.push('⚠ Técnico não reconhecido — escolher no formulário.')
      if (!client) notes.push('⚠ Cliente não reconhecido — escolher no formulário.')
      if (!type) notes.push('⚠ Tipo de intervenção não reconhecido — escolher no formulário.')

      const ins = await sql`insert into intervention_drafts ${sql({
        creator_id: String(s.ID), form_type: formType || null, id_record: s.IdRecord ? String(s.IdRecord) : null, intervention_date: date,
        client_name: client?.name ?? (disp(s.Cliente) || null), technician_name: tech?.name ?? (techName || null), license_plate: plate || null,
        imei: v.imei ?? null, ticket: ticket || null, form_values: sql.json(v), notes: sql.json(notes),
      })} on conflict (creator_id) do nothing returning id`
      if (ins.length) created++
    } catch (e) {
      errors.push(`${String(s.ID)}: ${(e as Error).message.slice(0, 120)}`)
    }
  }
  return { found: pending.length, created, already: await resolveRegisteredDrafts(), errors }
}
