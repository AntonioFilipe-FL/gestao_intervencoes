import 'server-only'
import { sql } from '@/lib/db'

/**
 * Zoho CRM (só leitura): Regime Contratual das Contas, ligado pelo campo "Nome Intranet".
 * Variáveis: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN (Self Client, scopes
 * ZohoCRM.modules.accounts.READ + ZohoCRM.coql.READ). Data center EU por omissão (ZOHO_ACCOUNTS_URL / ZOHO_API_URL).
 */
const ACCOUNTS = process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.eu'
const API = process.env.ZOHO_API_URL || 'https://www.zohoapis.eu'

export const zohoConfigured = () =>
  !!(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN)

let cached: { token: string; until: number } | null = null
async function accessToken() {
  if (cached && cached.until > Date.now()) return cached.token
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
  })
  const r = await fetch(`${ACCOUNTS}/oauth/v2/token`, { method: 'POST', body, cache: 'no-store' })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.access_token) throw new Error(`Zoho: não foi possível autenticar (${j.error ?? r.status})`)
  cached = { token: j.access_token, until: Date.now() + (Number(j.expires_in ?? 3600) - 120) * 1000 }
  return cached.token
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** Regime Contratual (array) por Nome Intranet (minúsculas), para os nomes pedidos */
export async function getCrmRegimes(names: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const uniq = [...new Set(names.map((n) => n.trim()).filter(Boolean))]
  const token = await accessToken()
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50)
    const query = `select NomeIntranet, Regime_Contratual from Accounts where NomeIntranet in (${chunk.map((n) => `'${esc(n)}'`).join(', ')}) limit 2000`
    const r = await fetch(`${API}/crm/v6/coql`, {
      method: 'POST', cache: 'no-store',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ select_query: query }),
    })
    if (r.status === 204) continue
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(`Zoho CRM: ${j.message ?? j.code ?? r.status}`)
    for (const a of j.data ?? []) {
      const key = String(a.NomeIntranet ?? '').trim().toLowerCase()
      if (!key) continue
      const reg: string[] = Array.isArray(a.Regime_Contratual) ? a.Regime_Contratual : a.Regime_Contratual ? [a.Regime_Contratual] : []
      out.set(key, [...new Set([...(out.get(key) ?? []), ...reg])])
    }
  }
  return out
}

/** "Venda" | "Aluguer" quando o CRM indica só um; null se vazio ou ambos */
export const regimeToModality = (reg: string[] | undefined) => {
  const v = (reg ?? []).some((x) => /vend/i.test(x)), a = (reg ?? []).some((x) => /alug/i.test(x))
  return v && !a ? 'Venda' : a && !v ? 'Aluguer' : null
}

export type CrmModalityResult = {
  checked: number; filled: number; notFound: string[]; both: string[]
  differs: { id: string; name: string; app: string; crm: string }[]
}

/** Preenche a Venda/Aluguer dos clientes ligados à Intranet que estão vazios; reporta divergências (não as altera) */
export async function fillClientModalityFromCrm(clientIds?: string[]): Promise<CrmModalityResult> {
  const clients = await sql<{ id: string; name: string; key: string; venda_aluguer: string | null }[]>`
    select id, name, coalesce(intranet_short_name, name) as key, venda_aluguer from clients
    where intranet_account_id is not null and active ${clientIds ? sql`and id = any(${clientIds})` : sql``}`
  const res: CrmModalityResult = { checked: clients.length, filled: 0, notFound: [], both: [], differs: [] }
  if (!clients.length) return res
  const crm = await getCrmRegimes(clients.map((c) => c.key))
  for (const c of clients) {
    const reg = crm.get(c.key.trim().toLowerCase())
    if (!reg) { res.notFound.push(c.name); continue }
    const mod = regimeToModality(reg)
    if (!mod) { if (reg.length > 1) res.both.push(c.name); continue }
    const cur = /alug/i.test(c.venda_aluguer ?? '') ? 'Aluguer' : /vend/i.test(c.venda_aluguer ?? '') ? 'Venda' : null
    if (!cur) {
      await sql`update clients set venda_aluguer = ${mod} where id = ${c.id}`
      res.filled++
    } else if (cur !== mod) res.differs.push({ id: c.id, name: c.name, app: c.venda_aluguer ?? '', crm: mod })
  }
  return res
}
