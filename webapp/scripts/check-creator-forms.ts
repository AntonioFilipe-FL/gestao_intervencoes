/**
 * Diagnóstico (só leitura): lê o relatório "Envio de formulários" do Zoho Creator e mostra os campos de cada registo,
 * para fazer a correspondência com os campos da intervenção. Não mostra credenciais.
 *
 *   railway run npx tsx scripts/check-creator-forms.ts            → nomes dos campos + valores distintos dos campos de estado
 *   railway run npx tsx scripts/check-creator-forms.ts --sample   → mostra também 2 registos completos (têm dados de clientes)
 *
 * Variáveis: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET e ZOHO_CREATOR_REFRESH_TOKEN (scope ZohoCreator.report.READ);
 * se não existir ZOHO_CREATOR_REFRESH_TOKEN usa ZOHO_REFRESH_TOKEN.
 */
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.eu'
const API = process.env.ZOHO_API_URL || 'https://www.zohoapis.eu'
const OWNER = process.env.ZOHO_CREATOR_OWNER || 'frotcom'
const APP = process.env.ZOHO_CREATOR_APP || 'gest-o-de-agendas-e-formul-rios'
const REPORT = process.env.ZOHO_CREATOR_REPORT || 'Envio_de_formul_rios_Report'
const SAMPLE = process.argv.includes('--sample')

async function main() {
  const refresh = process.env.ZOHO_CREATOR_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !refresh) throw new Error('Faltam as variáveis ZOHO_* (corra com: railway run …)')
  const tr = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({
    grant_type: 'refresh_token', client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET, refresh_token: refresh }) })
  const tj = await tr.json().catch(() => ({})) as { access_token?: string; error?: string }
  if (!tj.access_token) throw new Error(`Zoho: não foi possível autenticar (${tj.error ?? tr.status})`)

  const url = `${API}/creator/v2.1/data/${OWNER}/${APP}/report/${REPORT}?max_records=200`
  const r = await fetch(url, { headers: { Authorization: `Zoho-oauthtoken ${tj.access_token}` } })
  const j = await r.json().catch(() => ({})) as { code?: number; message?: string; data?: Record<string, unknown>[] }
  if (!r.ok || !Array.isArray(j.data)) throw new Error(`Creator: HTTP ${r.status} · ${j.message ?? JSON.stringify(j).slice(0, 300)}\n(se for falta de permissão, o refresh token precisa do scope ZohoCreator.report.READ)`)
  const rows = j.data
  console.log(`${rows.length} registo(s) lidos de ${REPORT}\n`)

  const kind = (v: unknown): string => v === null ? 'null' : Array.isArray(v) ? `lista(${v.length ? kind(v[0]) : ''})` : typeof v === 'object' ? `objeto{${Object.keys(v as object).join(',')}}` : typeof v
  const keys = new Map<string, { type: string; filled: number }>()
  for (const row of rows) for (const [k, v] of Object.entries(row)) {
    const e = keys.get(k) ?? { type: kind(v), filled: 0 }
    if (v !== null && v !== '' && !(Array.isArray(v) && !v.length)) { e.filled++; e.type = kind(v) }
    keys.set(k, e)
  }
  console.log('Campos (nome · tipo · preenchido em N registos):')
  for (const [k, e] of keys) console.log(`  ${k} · ${e.type} · ${e.filled}`)

  console.log('\nCampos com poucos valores distintos (estados, tipos, listas):')
  for (const k of keys.keys()) {
    const vals = new Set(rows.map((x) => { const v = x[k]; return typeof v === 'string' ? v : v && typeof v === 'object' && !Array.isArray(v) ? String((v as { zc_display_value?: string; display_value?: string }).zc_display_value ?? (v as { display_value?: string }).display_value ?? '') : '' }).filter(Boolean))
    if (vals.size > 0 && vals.size <= 12 && rows.length > vals.size) console.log(`  ${k}: ${[...vals].join(' | ')}`)
  }
  // formulário completo de cada tipo: lê um registo pelo IdRecord no relatório desse formulário (só nomes e tipos dos campos)
  const H = { Authorization: `Zoho-oauthtoken ${tj.access_token}` }
  const disp = (v: unknown) => String((v as { zc_display_value?: string } | null)?.zc_display_value ?? v ?? '')
  const REPORTS: Record<string, string> = {
    'Instalação': 'Formul_rio_de_instala_o_Report', 'Assistências': 'Formul_rio_de_assistencia_Report',
    'Troca de Viatura': 'Formul_rio_de_trocaViatura_Report', 'Upgrade': 'Formmul_rio_de_Upgrade_Report',
    'Reinstalação': 'Copy_of_Formul_rio_de_reinstala_o_Report', 'Desinstalação': 'Formul_rio_de_desinstala_o_Report',
    'Anomalia/Avaria': 'Formul_rio_de_anomalia_Report', 'Entrega/Recolha': 'Formul_rio_de_Entrega_Recolha_Report',
  }
  const deep = (v: unknown): string => {
    if (Array.isArray(v)) return v.length && typeof v[0] === 'object' && v[0] ? `lista de {${Object.keys(v[0] as object).join(', ')}}` : `lista(${v.length ? typeof v[0] : 'vazia'})`
    if (v && typeof v === 'object') return `objeto{${Object.keys(v as object).join(', ')}}`
    return v === null || v === '' ? 'vazio' : typeof v
  }
  for (const [t, rep] of Object.entries(REPORTS)) {
    // prefere um registo "Por validar"; senão, o mais recente desse tipo
    const cand = rows.filter((x) => disp(x.Tipo_de_formul_rio) === t)
    const row = cand.find((x) => /por validar/i.test(String(x.Estado))) ?? cand[0]
    console.log(`\n=== ${t} → ${rep} ===`)
    if (!row) { console.log('  (sem registos deste tipo nos 200 lidos)'); continue }
    const dr = await fetch(`${API}/creator/v2.1/data/${OWNER}/${APP}/report/${rep}/${row.IdRecord}`, { headers: H })
    const dj = await dr.json().catch(() => ({})) as { data?: Record<string, unknown>; message?: string }
    if (!dr.ok || !dj.data) { console.log(`  HTTP ${dr.status} · ${dj.message ?? JSON.stringify(dj).slice(0, 200)}`); continue }
    for (const [k, v] of Object.entries(dj.data)) console.log(`  ${k} · ${deep(v)}`)
  }

  if (SAMPLE) { console.log('\nExemplos:'); for (const row of rows.slice(0, 2)) console.log(JSON.stringify(row, null, 2)) }
}
main().catch((e) => { console.error(e.message); process.exit(1) })
