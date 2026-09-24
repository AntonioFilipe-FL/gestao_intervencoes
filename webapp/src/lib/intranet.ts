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

let loginPartnerId: string | null = null

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
  loginPartnerId = pick(data, ['partnerId', 'PartnerId', 'companyId', 'CompanyId'])
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

const asList = (d: unknown): Json[] => {
  if (Array.isArray(d)) return d as Json[]
  const o = d as Json | null
  // ex.: /api/devices devolve { defaultWarrantyDays, devices: [...], partner }
  for (const k of ['devices', 'accounts', 'items', 'data', 'result']) if (Array.isArray(o?.[k])) return o![k] as Json[]
  return []
}

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
  accounts: { total: number; linked: number; renamed: number; deactivated: number; pending: number }
  devices: { total: number; upserted: number; withoutClient: number; error?: string; sampleKeys?: string[]; mode?: string }
  unmatchedLocal: string[] // clientes da BD sem correspondência na Intranet
}

/** Sincroniza clientes (accounts) e IMEIs (devices) da Intranet para a BD. */
export async function syncFromIntranet(by: string): Promise<SyncResult> {
  const result: SyncResult = {
    ok: false,
    accounts: { total: 0, linked: 0, renamed: 0, deactivated: 0, pending: 0 },
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
          // sem correspondência: fica à espera de decisão do utilizador (associar / criar / ignorar)
          await tx`insert into intranet_pending (intranet_account_id, name, full_name)
                   values (${a.id}, ${a.name}, ${a.fullName})
                   on conflict (intranet_account_id) do update set name = excluded.name, full_name = excluded.full_name,
                     last_seen_at = now()`
        }
      }
      // limpar pendentes que já foram ligados ou que desapareceram da Intranet
      await tx`delete from intranet_pending p
               where exists (select 1 from clients c where c.intranet_account_id = p.intranet_account_id)
                  or not (p.intranet_account_id = any(${accounts.map(a => a.id)}))`
      const [{ n }] = await tx`select count(*)::int as n from intranet_pending where status = 'pending'`
      result.accounts.pending = n
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
      // Tentativas por ordem; um erro (ex.: 403 sem permissão) passa à seguinte:
      //   1) sem parâmetros   2) só partnerId   3) partnerId + searchAllFCPs   4) conta a conta (accountId)
      const partnerId = process.env.INTRANET_PARTNER_ID || loginPartnerId
      const attempts: [string, string][] = [['global', '/api/devices']]
      if (partnerId) {
        attempts.push(['parceiro', `/api/devices?partnerId=${encodeURIComponent(partnerId)}`])
        attempts.push(['parceiro, todos os FCP', `/api/devices?partnerId=${encodeURIComponent(partnerId)}&searchAllFCPs=true`])
      }
      let raw: (Json & { __accountId?: string })[] = []
      let mode = ''
      const attemptErrors: string[] = []
      for (const [label, path] of attempts) {
        try {
          raw = asList(await getJson(path, token))
          if (raw.length > 0) { mode = label; break }
        } catch (e) {
          attemptErrors.push(`${label}: ${(e as Error).message.slice(0, 80)}`)
        }
      }
      if (raw.length === 0) {
        mode = 'por conta'
        const out: (Json & { __accountId?: string })[] = []
        let failures = 0
        let firstError = ''
        const queue = [...accounts]
        const worker = async () => {
          for (let a = queue.shift(); a; a = queue.shift()) {
            try {
              const list = asList(await getJson(`/api/devices?accountId=${encodeURIComponent(a.id)}`, token!))
              for (const d of list) out.push({ ...d, __accountId: a.id })
            } catch (e) {
              failures++
              firstError ||= (e as Error).message
            }
          }
        }
        await Promise.all(Array.from({ length: 10 }, worker))
        raw = out
        if (failures) result.devices.error = `${failures} de ${accounts.length} conta(s) falharam ao obter equipamentos (ex.: ${firstError.slice(0, 150)}).`
      }
      result.devices.total = raw.length
      result.devices.mode = mode
      if (raw.length === 0 && !result.devices.error) {
        result.devices.error = `A Intranet não devolveu equipamentos em /api/devices (nem globalmente nem por conta).${attemptErrors.length ? ' Tentativas: ' + attemptErrors.join(' | ') : ''}`
      }
      const clientByAccount = new Map(
        (await sql<{ id: string; intranet_account_id: string }[]>`
          select id, intranet_account_id from clients where intranet_account_id is not null`).map(c => [c.intranet_account_id, c.id])
      )
      const rows = raw
        .map(d => {
          const acc = pick(d, ['accountId', 'companyId', 'account.id', 'company.id', 'clientId', 'AccountId']) ?? (d as { __accountId?: string }).__accountId ?? null
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
        result.devices.sampleKeys = Object.keys(raw[0] ?? {}).filter(k => k !== '__accountId')
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

// ---------------------------------------------------------------------------
// Associação manual de contas pendentes
// ---------------------------------------------------------------------------

/** Semelhança entre dois nomes (Dice sobre bigramas, 0..1) */
function similarity(a: string, b: string) {
  const x = norm(a), y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.includes(y) || y.includes(x)) return 0.9
  const grams = (s: string) => { const m = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) ?? 0) + 1) } return m }
  const gx = grams(x), gy = grams(y)
  let inter = 0
  for (const [g, n] of gx) inter += Math.min(n, gy.get(g) ?? 0)
  return (2 * inter) / (x.length - 1 + (y.length - 1))
}

export type PendingAccount = {
  intranet_account_id: string
  name: string
  full_name: string | null
  status: 'pending' | 'ignored'
  suggestion: { id: string; name: string; score: number } | null
}

/** Contas pendentes + clientes da BD ainda sem ligação (para escolher) */
export async function getPendingAccounts() {
  const [pending, candidates] = await Promise.all([
    sql<Omit<PendingAccount, 'suggestion'>[]>`
      select intranet_account_id, name, full_name, status from intranet_pending order by status, lower(name)`,
    sql<{ id: string; name: string }[]>`select id, name from clients where intranet_account_id is null order by lower(name)`,
  ])
  const withSuggestion: PendingAccount[] = pending.map(p => {
    let best: PendingAccount['suggestion'] = null
    for (const c of candidates) {
      const score = Math.max(similarity(p.name, c.name), p.full_name ? similarity(p.full_name, c.name) : 0)
      if (score > (best?.score ?? 0)) best = { id: c.id, name: c.name, score }
    }
    return { ...p, suggestion: best && best.score >= 0.6 ? best : null }
  })
  return { pending: withSuggestion, candidates }
}

/** Liga os IMEIs de uma conta ao cliente */
async function attachDevices(tx: typeof sql, intranetId: string, clientId: string) {
  await tx`update devices set client_id = ${clientId} where intranet_account_id = ${intranetId}`
}

export async function linkPending(intranetId: string, clientId: string) {
  await sql.begin(async tx => {
    const [p] = await tx`select name from intranet_pending where intranet_account_id = ${intranetId}`
    if (!p) throw new Error('Conta pendente não encontrada (sincronize de novo).')
    const [c] = await tx`select id, name, intranet_account_id from clients where id = ${clientId}`
    if (!c) throw new Error('Cliente não encontrado.')
    if (c.intranet_account_id) throw new Error(`O cliente "${c.name}" já está ligado a outra conta da Intranet.`)
    // passa a usar o nome da Intranet, salvo se outro cliente já tiver esse nome
    const [clash] = await tx`select id from clients where lower(name) = lower(${p.name}) and id <> ${clientId}`
    await tx`update clients set intranet_account_id = ${intranetId}, intranet_short_name = ${p.name}, active = true,
             intranet_synced_at = now() ${clash ? tx`` : tx`, name = ${p.name}`} where id = ${clientId}`
    await attachDevices(tx as unknown as typeof sql, intranetId, clientId)
    await tx`delete from intranet_pending where intranet_account_id = ${intranetId}`
  })
}

export async function createFromPending(intranetIds: string[]) {
  let created = 0
  await sql.begin(async tx => {
    const rows = await tx`select intranet_account_id, name from intranet_pending where intranet_account_id = any(${intranetIds})`
    for (const p of rows) {
      const [c] = await tx`insert into clients (name, active, intranet_account_id, intranet_short_name, intranet_synced_at, created_via)
                           values (${p.name}, true, ${p.intranet_account_id}, ${p.name}, now(), 'intranet_manual')
                           on conflict (lower(name)) do nothing returning id`
      if (!c) continue // já existe um cliente com este nome: tem de ser associado manualmente
      await attachDevices(tx as unknown as typeof sql, p.intranet_account_id, c.id)
      await tx`delete from intranet_pending where intranet_account_id = ${p.intranet_account_id}`
      created++
    }
  })
  return created
}

export async function setPendingStatus(intranetIds: string[], status: 'pending' | 'ignored') {
  await sql`update intranet_pending set status = ${status} where intranet_account_id = any(${intranetIds})`
}

// ---------------------------------------------------------------------------
// Rever clientes criados automaticamente por versões anteriores da sincronização
// (ligados à Intranet, sem intervenções e sem dados próprios da folha) → voltam a "Por associar"
// ---------------------------------------------------------------------------
const autoCreatedWhere = (tx: typeof sql) => tx`
  c.intranet_account_id is not null and c.created_via is distinct from 'intranet_manual'
  and c.venda_aluguer is null and c.nos_vdf is null and c.report_projeto_contrato is null
  and not exists (select 1 from interventions i where i.client_id = c.id)
  and not exists (select 1 from clients o where o.id <> c.id and o.intranet_account_id is null and lower(o.name) = lower(c.name))`

export async function countAutoCreatedClients() {
  const [{ n }] = await sql`select count(*)::int as n from clients c where ${autoCreatedWhere(sql)}`
  return n as number
}

export async function revertAutoCreatedClients() {
  return sql.begin(async tx => {
    const rows = await tx`select c.id, c.name, c.intranet_account_id from clients c where ${autoCreatedWhere(tx as unknown as typeof sql)}`
    if (rows.length === 0) return 0
    const ids = rows.map(r => r.id)
    await tx`insert into intranet_pending ${tx(rows.map(r => ({ intranet_account_id: r.intranet_account_id, name: r.name, full_name: null })))}
             on conflict (intranet_account_id) do update set status = 'pending'`
    await tx`update devices set client_id = null where client_id = any(${ids})`
    await tx`delete from clients where id = any(${ids})`
    return rows.length
  })
}
