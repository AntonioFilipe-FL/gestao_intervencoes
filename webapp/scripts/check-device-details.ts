/**
 * Diagnóstico (só leitura): mostra os campos com datas dos detalhes de um equipamento na Intranet,
 * para confirmar qual é o da última comunicação. Não mostra credenciais.
 *   npx tsx scripts/check-device-details.ts <IMEI>
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const IMEI = (process.argv[2] ?? '').trim()
if (!/^\d{14,15}$/.test(IMEI)) { console.error('Uso: npx tsx scripts/check-device-details.ts <IMEI>'); process.exit(1) }
const BASE = (process.env.INTRANET_API_URL || 'https://intranetapi.frotcom.com').replace(/\/$/, '')
// no railway run o DATABASE_URL é interno (postgres.railway.internal): usa o público se existir; se falhar, segue sem BD
const sql = postgres((process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL)!, { onnotice: () => {}, connect_timeout: 5, connection: { search_path: 'gestao_interv' } })

async function main() {
  if (!process.env.INTRANET_USER || !process.env.INTRANET_PASSWORD)
    throw new Error('Faltam INTRANET_USER / INTRANET_PASSWORD neste ambiente. Corra com as variáveis do Railway: railway run npx tsx scripts/check-device-details.ts <IMEI>')
  const [row] = await sql<{ vid: string | null }[]>`select intranet_device_id as vid from devices where imei = ${IMEI}`.catch(() => [] as { vid: string | null }[])
  const auth = await fetch(`${BASE}/api/authorize`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.INTRANET_USER, password: process.env.INTRANET_PASSWORD }) })
  if (!auth.ok) throw new Error(`Login falhou (HTTP ${auth.status})`)
  const { token, Token } = await auth.json() as { token?: string; Token?: string }
  const t = token ?? Token!
  try {
    let vid = row?.vid ?? null
    if (!vid) {
      // como a app: procura o vehicleId na lista de equipamentos da Intranet
      const l = await (await fetch(`${BASE}/api/devices?api_key=${encodeURIComponent(t)}`)).json() as unknown
      const list = (Array.isArray(l) ? l : ((l as { devices?: unknown[] })?.devices ?? [])) as Record<string, unknown>[]
      const hit = list.find((x) => String(x.imei ?? x.IMEI ?? x.Imei ?? '') === IMEI)
      vid = hit ? String(hit.vehicleId ?? hit.VehicleId ?? hit.id ?? '') || null : null
    }
    if (!vid) throw new Error('IMEI não encontrado na Intranet.')
    const d = { vid }
    const r = await fetch(`${BASE}/api/devices/details/${encodeURIComponent(d.vid)}?api_key=${encodeURIComponent(t)}`)
    const j = await r.json() as Record<string, unknown>
    const walk = (o: unknown, path = ''): void => {
      if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k)
      else if (typeof o === 'string' && /\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/.test(o)) console.log(`${path}: ${o}`)
    }
    console.log(`Campos com datas em /api/devices/details/${d.vid}:`)
    walk(j)
  } finally {
    await fetch(`${BASE}/api/authorize?api_key=${encodeURIComponent(t)}`, { method: 'DELETE' }).catch(() => {})
  }
}
main().then(() => sql.end(), async (e) => { console.error(e.message); await sql.end(); process.exit(1) })
