import 'server-only'
import { sql } from '@/lib/db'

/**
 * Integração com a Intranet API da Frotcom (mesmo padrão do projeto Car_Sharing):
 *   POST {INTRANET_API_URL}/api/authorize  { username, password } → { token }   (sem MFA; expira após 20 min sem uso)
 *   GET  {INTRANET_API_URL}/api/accounts?api_key={token}          → [ { id, name, shortName, ... } ]
 *   GET  {INTRANET_API_URL}/api/devices?api_key={token}           → [ { imei, accountId, ... } ]  (campos lidos de forma tolerante)
 * Variáveis: INTRANET_API_URL, INTRANET_USER, INTRANET_PASSWORD
 */
const baseUrl = () => (process.env.INTRANET_API_URL || 'https://intranetapi.frotcom.com/').replace(/\/$/, '')

export const intranetConfigured = () => !!(process.env.INTRANET_USER && process.env.INTRANET_PASSWORD)

type Json = Record<string, unknown>

async function login(): Promise<string> {
  if (!intranetConfigured()) throw new Error('Faltam as variáveis INTRANET_USER / INTRANET_PASSWORD.')
  const res = await fetch(`${baseUrl()}/api/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.INTRANET_USER, password: process.env.INTRANET_PASSWORD }),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Login na Intranet falhou (HTTP ${res.status}). Confirme INTRANET_USER / INTRANET_PASSWORD.`)
  const data = (await res.json()) as Json
  const token = (data.token ?? data.Token) as string | undefined
  if (!token) throw new Error('A Intranet não devolveu token de autenticação.')
  return token
}

async function logout(token: string) {
  await fetch(`${baseUrl()}/api/authorize?api_key=${encodeURIComponent(token)}`, { method: 'DELETE' }).catch(() => {})
}

async function getJson(path: string, token: string): Promise<unknown> {
  const url = `${baseUrl()}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(token)}`
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' })
  if (res.status === 204) return []
  if (!res.ok) throw new Error(`Intranet ${path}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.json()
}

const asList = (d: unknown): Json[] =>
  Array.isArray(d) ? (d as Json[]) : ((d as Json)?.items ?? (d as Json)?.data ?? (d as Json)?.result ?? []) as Json[]

/** Primeiro valor não vazio entre vários nomes de campo possíveis (inclui campos aninhados "a.b") */
function pick(o: Json, keys: string[]): string | null {
  for (const k of keys) {
    const v = k.split('.').reduce<unknown>((acc, p) => (acc as Json | undefined)?.[p], o)
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return null
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export type SyncResult = {
  ok: boolean
  error?: string
  accounts: { total: number; created: number; linked: number; renamed: number; deactivated: number }
  devices: { total: number; upserted: number; withoutClient: number; error?: string; sampleKeys?: string[] }
  unmatchedLocal: string[] // clientes da BD sem correspondência na Intranet
}

/** Sincroniza clientes (accounts) e IMEIs (devices) da Intranet para a BD. */
export async function syncFromIntranet(by: string): Promise<SyncResult> {
  const result: SyncResult = {
    ok: false,
    accounts: { total: 0, created: 0, linked: 0, renamed: 0, deactivated: 0 },
    devices: { total: 0, upserted: 0, withoutClient: 0 },
    unmatchedLocal: [],
  }
  let token: string | null = null
  try {
    token = await login()

    // ---------------- Clientes ----------------
    const accounts = asList(await getJson('/api/accounts', token))
      .map(a => ({
        id: pick(a, ['id', 'accountId', 'Id']),
        name: pick(a, ['shortName', 'name', 'Name']),
        fullName: pick(a, ['name', 'Name']),
      }))
      .filter((a): a is { id: string; name: string; fullName: string | null } => !!a.id && !!a.name)
    result.accounts.total = accounts.length
    if (accounts.length === 0) throw new Error('A Intranet não devolveu nenhuma conta.')

    const local = await sql<{ id: string; name: string; intranet_account_id: string | null }[]>`
      select id, name, intranet_account_id from clients`
    const byIntranet = new Map(local.filter(c => c.intranet_account_id).map(c => [c.intranet_account_id!, c]))
    const byName = new Map<string, (typeof local)[number]>()
    for (const c of local) if (!c.intranet_account_id) byName.set(norm(c.name), c)

    await sql.begin(async tx => {
      for (const a of accounts) {
        const linked = byIntranet.get(a.id)
        if (linked) {
          if (linked.name !== a.name) {
            // evitar colisão com outro cliente que já tenha esse nome
            const [clash] = await tx`select id from clients where lower(name) = lower(${a.name}) and id <> ${linked.id}`
            if (!clash) { await tx`update clients set name = ${a.name} where id = ${linked.id}`; result.accounts.renamed++ }
          }
          await tx`update clients set active = true, intranet_short_name = ${a.name}, intranet_synced_at = now() where id = ${linked.id}`
          continue
        }
        const match = byName.get(norm(a.name)) ?? (a.fullName ? byName.get(norm(a.fullName)) : undefined)
        if (match) {
          await tx`update clients set intranet_account_id = ${a.id}, intranet_short_name = ${a.name}, active = true,
                   intranet_synced_at = now() where id = ${match.id}`
          byName.delete(norm(match.name))
          result.accounts.linked++
        } else {
          await tx`insert into clients (name, active, intranet_account_id, intranet_short_name, intranet_synced_at)
                   values (${a.name}, true, ${a.id}, ${a.name}, now())
                   on conflict (lower(name)) do update set intranet_account_id = excluded.intranet_account_id,
                     intranet_short_name = excluded.intranet_short_name, intranet_synced_at = now(), active = true`
          result.accounts.created++
        }
      }
      // ligados à Intranet mas que já não existem lá → inativos (o histórico mantém-se)
      const ids = accounts.map(a => a.id)
      const off = await tx`update clients set active = false
                           where intranet_account_id is not null and not (intranet_account_id = any(${ids})) and active
                           returning id`
      result.accounts.deactivated = off.length
    })
    result.unmatchedLocal = [...byName.values()].map(c => c.name).sort((x, y) => x.localeCompare(y, 'pt'))

    // ---------------- IMEIs ----------------
    try {
      const raw = asList(await getJson('/api/devices', token))
      result.devices.total = raw.length
      const clientByAccount = new Map(
        (await sql<{ id: string; intranet_account_id: string }[]>`
          select id, intranet_account_id from clients where intranet_account_id is not null`).map(c => [c.intranet_account_id, c.id])
      )
      const rows = raw
        .map(d => {
          const acc = pick(d, ['accountId', 'companyId', 'account.id', 'company.id', 'clientId', 'AccountId'])
          return {
            imei: pick(d, ['imei', 'IMEI', 'Imei', 'deviceImei', 'serialNumber', 'serial']),
            intranet_device_id: pick(d, ['id', 'deviceId', 'Id']),
            intranet_account_id: acc,
            client_id: acc ? clientByAccount.get(acc) ?? null : null,
            model: pick(d, ['deviceTypeName', 'deviceType.name', 'model', 'deviceModel', 'type', 'deviceType']),
            license_plate: pick(d, ['licensePlate', 'vehicleLicensePlate', 'vehicle.licensePlate', 'plate', 'vehiclePlate']),
          }
        })
        .filter((d): d is typeof d & { imei: string } => !!d.imei && /^\d{8,20}$/.test(d.imei))

      if (raw.length > 0 && rows.length === 0) {
        result.devices.error = 'Formato de resposta de /api/devices não reconhecido (não encontrei o campo do IMEI).'
        result.devices.sampleKeys = Object.keys(raw[0] ?? {})
      } else if (rows.length > 0) {
        const seen = new Map(rows.map(r => [r.imei, r])) // IMEIs repetidos: fica o último
        const unique = [...seen.values()]
        await sql.begin(async tx => {
          for (let i = 0; i < unique.length; i += 500) {
            const batch = unique.slice(i, i + 500)
            await tx`insert into devices ${tx(batch, 'imei', 'intranet_device_id', 'intranet_account_id', 'client_id', 'model', 'license_plate')}
                     on conflict (imei) do update set intranet_device_id = excluded.intranet_device_id,
                       intranet_account_id = excluded.intranet_account_id, client_id = excluded.client_id,
                       model = excluded.model, license_plate = excluded.license_plate, active = true, synced_at = now()`
          }
          await tx`update devices set active = false where not (imei = any(${unique.map(u => u.imei)}))`
        })
        result.devices.upserted = unique.length
        result.devices.withoutClient = unique.filter(u => !u.client_id).length
      }
    } catch (e) {
      result.devices.error = (e as Error).message
    }

    result.ok = true
  } catch (e) {
    result.error = (e as Error).message
  } finally {
    if (token) await logout(token)
  }

  await sql`insert into app_settings (key, value, updated_by) values ('intranet_last_sync', ${JSON.stringify({ at: new Date().toISOString(), ...result })}, ${by})
            on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`
  return result
}

export async function getLastSync(): Promise<(SyncResult & { at: string; by: string | null }) | null> {
  const [r] = await sql<{ value: string; updated_by: string | null }[]>`select value, updated_by from app_settings where key = 'intranet_last_sync'`
  return r ? { ...JSON.parse(r.value), by: r.updated_by } : null
}
