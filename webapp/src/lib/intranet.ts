import 'server-only'
import { sql } from '@/lib/db'
import { zohoConfigured, fillClientModalityFromCrm } from '@/lib/zoho'
import { matchEquipment } from '@/lib/hardware'

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
/** "2026-10-07T…", "07/10/2026" ou "2026-10-07" → "2026-10-07" */
function toDate(v: string | null): string | null {
  if (!v) return null
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = v.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4})/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  const d = new Date(v)
  return isNaN(+d) ? null : d.toISOString().slice(0, 10)
}

/**
 * Receção automática de material novo: IMEIs na conta "Frotcom Lusitana" (a conta principal, não as
 * "- Installation", "- Transit"…) com "Shipped on" na janela (1.ª vez: 15 dias; depois: desde a véspera da última execução), que nunca tiveram movimento
 * de stock nem intervenção → entram no armazém "A1 …" (Venda). Corre em cada sincronização (1.ª do dia no login);
 * é idempotente: um IMEI só é recebido uma vez. O responsável da logística distribui depois.
 */
export async function autoReceiveNewDevices(): Promise<number> {
  // janela: na 1.ª execução, os últimos 15 dias; depois, as últimas 24h — contadas desde a última execução,
  // para não perder nada se passarem dias sem ninguém entrar na app
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const [last] = await sql<{ value: string }[]>`select value from app_settings where key = 'auto_reception_last_run'`
  const [{ since }] = await sql<{ since: string }[]>`
    select (case when ${last?.value ?? null}::date is null then ${today}::date - 15
                 else least(${last?.value ?? today}::date, ${today}::date) - 1 end)::text as since`
  const cfg = { value: since }
  const [a1] = await sql<{ id: string }[]>`select id from warehouses where active and name ilike 'A1 %' order by name limit 1`
  if (!a1) throw new Error('Não existe um armazém "A1 …" para a receção automática.')
  const rows = await sql<{ imei: string; model: string | null; shipped_on: string }[]>`
    select d.imei, d.model, d.shipped_on::text from devices d
    where d.active and d.shipped_on >= ${cfg.value}::date and d.imei ~ '^[0-9]{15}$' and d.imei !~ '^80{6}'
      and (exists (select 1 from clients c where c.intranet_account_id = d.intranet_account_id and lower(btrim(coalesce(c.intranet_short_name, c.name))) = 'frotcom lusitana')
        or exists (select 1 from intranet_pending p where p.intranet_account_id = d.intranet_account_id and lower(btrim(p.name)) = 'frotcom lusitana'))
      and not exists (select 1 from stock_movements m where m.imei = d.imei)
      and not exists (select 1 from ignored_imeis ig where ig.imei = d.imei)
      and not exists (select 1 from interventions i where d.imei in (gestao_interv.imei_norm(i.imei), gestao_interv.imei_norm(i.spent_equipment_imei), gestao_interv.imei_norm(i.return_equipment_imei)))`
  const markRun = () => sql`insert into app_settings (key, value, updated_by) values ('auto_reception_last_run', ${today}, 'sistema')
                             on conflict (key) do update set value = excluded.value, updated_at = now()`
  if (!rows.length) { await markRun(); return 0 }
  const [equipment, mappings] = await Promise.all([
    sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
    sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
  ])
  const ins = rows.map((r) => ({
    imei: r.imei, equipment_id: matchEquipment(r.model, equipment, mappings)?.item.id ?? null, kind: 'rececao',
    from_warehouse_id: null, to_warehouse_id: a1.id, modality: 'Venda', moved_at: r.shipped_on,
    notes: `Receção automática (Intranet · Shipped on ${r.shipped_on.split('-').reverse().join('/')})`, created_by: 'auto:rececao-intranet',
  }))
  for (let i = 0; i < ins.length; i += 500) await sql`insert into stock_movements ${sql(ins.slice(i, i + 500))}`
  // acessórios do kit de cada equipamento recebido (chegam juntamente com o equipamento) → entram também no A1
  const byAccessory: Record<string, number> = {}
  try {
    const perEq = new Map<string, Map<string, number>>() // shipped_on → equipment_id → nº
    for (const r of ins) if (r.equipment_id) {
      const m = perEq.get(r.moved_at) ?? new Map<string, number>()
      m.set(r.equipment_id, (m.get(r.equipment_id) ?? 0) + 1); perEq.set(r.moved_at, m)
    }
    const eqIds = [...new Set(ins.map((r) => r.equipment_id).filter(Boolean))] as string[]
    const kit = eqIds.length ? await sql<{ equipment_id: string; item_id: string; item: string; quantity: number }[]>`
      select k.equipment_id, m.item_id, si.name as item, k.quantity
      from equipment_kit_items k
      join accessory_stock_map m on m.accessory_id = k.accessory_id
      join accessory_stock_items si on si.id = m.item_id
      where k.equipment_id = any(${eqIds})` : []
    const acc: { item_id: string; warehouse_id: string; kind: string; quantity: number; moved_at: string; notes: string; created_by: string }[] = []
    for (const [day, m] of perEq) {
      const qty = new Map<string, { q: number; name: string }>()
      for (const k of kit) {
        const n = m.get(k.equipment_id)
        if (!n) continue
        const cur = qty.get(k.item_id) ?? { q: 0, name: k.item }
        cur.q += n * k.quantity; qty.set(k.item_id, cur)
      }
      for (const [item_id, { q, name }] of qty) {
        acc.push({ item_id, warehouse_id: a1.id, kind: 'rececao', quantity: q, moved_at: day,
          notes: `Receção automática: kit dos equipamentos (Shipped on ${day.split('-').reverse().join('/')})`, created_by: 'auto:rececao-intranet' })
        byAccessory[name] = (byAccessory[name] ?? 0) + q
      }
    }
    if (acc.length) await sql`insert into accessory_movements ${sql(acc)}`
  } catch (e) {
    console.error('Receção automática: falhou a entrada dos acessórios do kit:', e)
  }
  await markRun()
  // registo do lote para o aviso (pop-up) aos utilizadores — guarda os últimos 30 lotes
  const byEquipment: Record<string, number> = {}
  for (const r of ins) {
    const name = equipment.find((e) => e.id === r.equipment_id)?.name ?? 'Sem equipamento'
    byEquipment[name] = (byEquipment[name] ?? 0) + 1
  }
  const [prev] = await sql<{ value: string }[]>`select value from app_settings where key = 'auto_reception_batches'`
  const batches = [...(prev ? JSON.parse(prev.value) : []), { id: Date.now(), at: new Date().toISOString(), n: ins.length, byEquipment, byAccessory }].slice(-30)
  await sql`insert into app_settings (key, value, updated_by) values ('auto_reception_batches', ${JSON.stringify(batches)}, 'sistema')
            on conflict (key) do update set value = excluded.value, updated_at = now()`
  return ins.length
}

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
  devices: { total: number; upserted: number; withoutClient: number; error?: string; sampleKeys?: string[]; mode?: string; withShippedOn?: number; autoReceived?: number; autoReceiveError?: string }
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
    // uma conta da Intranet pode estar ligada a vários clientes da BD (ex.: venda e aluguer)
    const byIntranet = new Map<string, (typeof local)[number][]>()
    for (const c of local) if (c.intranet_account_id) byIntranet.set(c.intranet_account_id, [...(byIntranet.get(c.intranet_account_id) ?? []), c])
    const byName = new Map<string, (typeof local)[number]>()
    for (const c of local) if (!c.intranet_account_id) byName.set(norm(c.name), c)

    await sql.begin(async tx => {
      for (const a of accounts) {
        const linkedList = byIntranet.get(a.id)
        if (linkedList?.length) {
          // todos os clientes da conta ficam com o nome (curto) da Intranet; o nome antigo fica guardado para a importação da Sheet.
          // Com vários clientes (venda/aluguer) o nome repete-se e distinguem-se pela modalidade no registo.
          for (const linked of linkedList) {
            if (linked.name === a.name) continue
            await tx`update clients set name = ${a.name},
                       sheet_names = case when ${linked.name}::text = any(coalesce(sheet_names, '{}')) then sheet_names
                                          else array_append(coalesce(sheet_names, '{}'), ${linked.name}::text) end
                     where id = ${linked.id}`
            result.accounts.renamed++
          }
          await tx`update clients set active = true, intranet_short_name = ${a.name}, intranet_synced_at = now()
                   where intranet_account_id = ${a.id}`
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
      // com vários clientes na mesma conta, o IMEI fica no cliente "principal" (o primeiro ligado);
      // as pesquisas por cliente usam a conta, por isso todos os clientes da conta veem os IMEIs
      const clientByAccount = new Map<string, string>()
      for (const c of await sql<{ id: string; intranet_account_id: string }[]>`
          select id, intranet_account_id from clients where intranet_account_id is not null
          order by intranet_account_id, intranet_synced_at nulls last, created_at`)
        if (!clientByAccount.has(c.intranet_account_id)) clientByAccount.set(c.intranet_account_id, c.id)
      const rows = raw
        .map(d => {
          const acc = pick(d, ['accountId', 'companyId', 'account.id', 'company.id', 'clientId', 'AccountId']) ?? (d as { __accountId?: string }).__accountId ?? null
          return {
            imei: pick(d, ['imei', 'IMEI', 'Imei', 'deviceImei', 'serialNumber', 'serial']),
            intranet_device_id: pick(d, ['id', 'deviceId', 'Id']),
            intranet_account_id: acc,
            client_id: acc ? clientByAccount.get(acc) ?? null : null,
            // só o campo "hardware" da Intranet (ex.: "Teltonika FMC150-EU (QJIB0)"); outros campos genéricos
            // (type, deviceType…) traziam valores que não são hardware. Valores só numéricos são ignorados.
            model: ((h) => (h && !/^\d+$/.test(h) ? h : null))(pick(d, ['hardware', 'hardwareName'])),
            license_plate: pick(d, ['licensePlate', 'vehicleLicensePlate', 'vehicle.licensePlate', 'plate', 'vehiclePlate']),
            shipped_on: toDate(pick(d, ['shippedOn', 'shipped_on', 'ShippedOn', 'shippedDate', 'shippingDate', 'shipDate', 'dateShipped'])),
            gsm_operator: pick(d, ['gsmOperator', 'GsmOperator', 'gsm_operator']),
          }
        })
        .filter((d): d is typeof d & { imei: string } => !!d.imei && /^\d{8,20}$/.test(d.imei))

      if (raw.length > 0 && rows.length === 0) {
        result.devices.error = 'Formato de resposta de /api/devices não reconhecido (não encontrei o campo do IMEI).'
        result.devices.sampleKeys = Object.keys(raw[0] ?? {}).filter(k => k !== '__accountId')
      } else if (rows.length > 0) {
        const ignored = new Set((await sql<{ imei: string }[]>`select imei from ignored_imeis`.catch(() => [])).map((r) => r.imei))
        const seen = new Map(rows.filter(r => !ignored.has(r.imei)).map(r => [r.imei, r])) // IMEIs repetidos: fica o último; ignorados: fora
        const unique = [...seen.values()]
        await sql.begin(async tx => {
          for (let i = 0; i < unique.length; i += 500) {
            const batch = unique.slice(i, i + 500)
            await tx`insert into devices ${tx(batch, 'imei', 'intranet_device_id', 'intranet_account_id', 'client_id', 'model', 'license_plate', 'shipped_on', 'gsm_operator')}
                     on conflict (imei) do update set intranet_device_id = excluded.intranet_device_id,
                       intranet_account_id = excluded.intranet_account_id, client_id = excluded.client_id,
                       model = excluded.model, license_plate = excluded.license_plate,
                       shipped_on = coalesce(excluded.shipped_on, devices.shipped_on),
                       gsm_operator = coalesce(excluded.gsm_operator, devices.gsm_operator), active = true, synced_at = now()`
          }
          await tx`update devices set active = false where not (imei = any(${unique.map(u => u.imei)}))`

          // histórico matrícula → IMEI: fecha o registo anterior quando o IMEI de uma matrícula muda
          await tx`update device_plate_history h set seen_to = now()
                   where h.seen_to is null and exists (
                     select 1 from devices d where d.active and gestao_interv.plate_norm(d.license_plate) = h.plate_norm and d.imei <> h.imei)
                     and not exists (
                     select 1 from devices d where d.active and gestao_interv.plate_norm(d.license_plate) = h.plate_norm and d.imei = h.imei)`
          await tx`insert into device_plate_history (plate_norm, license_plate, imei, client_id, model)
                   select gestao_interv.plate_norm(d.license_plate), d.license_plate, d.imei, d.client_id, d.model
                   from devices d
                   where d.active and gestao_interv.plate_norm(d.license_plate) is not null
                     and not exists (select 1 from device_plate_history h
                                     where h.seen_to is null and h.plate_norm = gestao_interv.plate_norm(d.license_plate) and h.imei = d.imei)`
        })
        result.devices.upserted = unique.length
        result.devices.withoutClient = unique.filter(u => !u.client_id).length
        result.devices.withShippedOn = unique.filter(u => u.shipped_on).length
        if (!result.devices.withShippedOn) result.devices.sampleKeys = Object.keys(raw[0] ?? {}).filter(k => k !== '__accountId')
        try { result.devices.autoReceived = await autoReceiveNewDevices() }
        catch (e) { result.devices.autoReceiveError = (e as Error).message }
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
    // passa a usar o nome da Intranet (o nome antigo fica guardado para a importação da Sheet)
    await tx`update clients set intranet_account_id = ${intranetId}, intranet_short_name = ${p.name}, active = true,
             intranet_synced_at = now() ${c.name === p.name ? tx`` : tx`, name = ${p.name}, sheet_names = array_append(coalesce(sheet_names, '{}'), ${c.name}::text)`} where id = ${clientId}`
    await attachDevices(tx as unknown as typeof sql, intranetId, clientId)
    await tx`delete from intranet_pending where intranet_account_id = ${intranetId}`
  })
  await fillFromCrmQuietly([clientId])
}

/** Liga mais um cliente da BD a uma conta da Intranet já ligada (ex.: o cliente de aluguer da mesma empresa) */
export async function linkAdditionalClient(intranetId: string, clientId: string) {
  await sql.begin(async tx => {
    const [c] = await tx`select id, name, intranet_account_id from clients where id = ${clientId}`
    if (!c) throw new Error('Cliente não encontrado.')
    if (c.intranet_account_id === intranetId) throw new Error(`"${c.name}" já está ligado a esta conta.`)
    if (c.intranet_account_id) throw new Error(`O cliente "${c.name}" já está ligado a outra conta da Intranet — desligue-o primeiro.`)
    const [main] = await tx`select intranet_short_name from clients where intranet_account_id = ${intranetId} limit 1`
    const [p] = await tx`select name from intranet_pending where intranet_account_id = ${intranetId}`
    if (!main && !p) throw new Error('Conta da Intranet não encontrada (sincronize de novo).')
    // fica com o nome da Intranet, como os restantes clientes da conta (distingue-se pela modalidade Venda/Aluguer)
    const accName = (main?.intranet_short_name ?? p.name) as string
    await tx`update clients set intranet_account_id = ${intranetId}, intranet_short_name = ${accName},
             active = true, intranet_synced_at = now()
             ${c.name === accName ? tx`` : tx`, name = ${accName}, sheet_names = array_append(coalesce(sheet_names, '{}'), ${c.name}::text)`}
             where id = ${clientId}`
    // se a conta ainda estava por associar, os IMEIs ficam neste cliente
    if (p) {
      await attachDevices(tx as unknown as typeof sql, intranetId, clientId)
      await tx`delete from intranet_pending where intranet_account_id = ${intranetId}`
    }
  })
}

/** Desliga um cliente da conta da Intranet. Se era o único, a conta volta a "Por associar". */
export async function unlinkClient(clientId: string) {
  await sql.begin(async tx => {
    const [c] = await tx`select id, name, intranet_account_id, intranet_short_name from clients where id = ${clientId}`
    if (!c?.intranet_account_id) throw new Error('Este cliente não está ligado à Intranet.')
    // volta ao último nome da BD/Sheet (os clientes sem ligação têm nomes únicos)
    const back = (await tx`select coalesce(sheet_names[array_length(sheet_names, 1)], name) as n from clients where id = ${clientId}`)[0].n as string
    const [taken] = await tx`select id from clients where lower(name) = lower(${back}) and intranet_account_id is null and id <> ${clientId}`
    await tx`update clients set intranet_account_id = null, intranet_synced_at = null,
             name = ${taken ? `${back} (${String(clientId).slice(0, 4)})` : back} where id = ${clientId}`
    const [other] = await tx`select id from clients where intranet_account_id = ${c.intranet_account_id}
                             order by intranet_synced_at nulls last, created_at limit 1`
    await tx`update devices set client_id = ${other?.id ?? null} where intranet_account_id = ${c.intranet_account_id}`
    if (!other)
      await tx`insert into intranet_pending (intranet_account_id, name, full_name)
               values (${c.intranet_account_id}, ${c.intranet_short_name ?? c.name}, null)
               on conflict (intranet_account_id) do update set status = 'pending'`
  })
}

export type LinkedAccount = { intranet_account_id: string; name: string; clients: { id: string; name: string; venda_aluguer: string | null }[] }

/** Contas da Intranet ligadas e os respetivos clientes da BD */
export async function getLinkedAccounts(): Promise<LinkedAccount[]> {
  return sql<LinkedAccount[]>`
    select intranet_account_id, min(coalesce(intranet_short_name, name)) as name,
           json_agg(json_build_object('id', id, 'name', name, 'venda_aluguer', venda_aluguer) order by lower(name)) as clients
    from clients where intranet_account_id is not null
    group by intranet_account_id order by lower(min(coalesce(intranet_short_name, name)))`
}

/** Venda/Aluguer do cliente a partir do Zoho CRM (se configurado); nunca falha a operação principal */
async function fillFromCrmQuietly(clientIds: string[]) {
  if (!clientIds.length || !zohoConfigured()) return
  try { await fillClientModalityFromCrm(clientIds) } catch (e) { console.error('Zoho CRM (Regime Contratual):', (e as Error).message) }
}

export async function createFromPending(intranetIds: string[]) {
  let created = 0
  const newIds: string[] = []
  await sql.begin(async tx => {
    const rows = await tx`select intranet_account_id, name from intranet_pending where intranet_account_id = any(${intranetIds})`
    for (const p of rows) {
      // já existe um cliente da BD (sem ligação) com este nome: tem de ser associado manualmente
      const [same] = await tx`select id from clients where lower(name) = lower(${p.name}) and intranet_account_id is null`
      if (same) continue
      const [c] = await tx`insert into clients (name, active, intranet_account_id, intranet_short_name, intranet_synced_at, created_via)
                           values (${p.name}, true, ${p.intranet_account_id}, ${p.name}, now(), 'intranet_manual') returning id`
      await attachDevices(tx as unknown as typeof sql, p.intranet_account_id, c.id)
      await tx`delete from intranet_pending where intranet_account_id = ${p.intranet_account_id}`
      newIds.push(c.id)
      created++
    }
  })
  await fillFromCrmQuietly(newIds)
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

export async function listAutoCreatedClients() {
  return sql<{ name: string; devices: number }[]>`
    select c.name, (select count(*)::int from devices d where d.client_id = c.id) as devices
    from clients c where ${autoCreatedWhere(sql)} order by lower(c.name)`
}

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
    await tx`update device_plate_history set client_id = null where client_id = any(${ids})`
    await tx`delete from clients where id = any(${ids})`
    return rows.length
  })
}

// ---------------------------------------------------------------------------
// Sincronização automática (no login)
// ---------------------------------------------------------------------------

/** Intervalo mínimo entre sincronizações automáticas (evita repetir quando várias pessoas entram seguidas) */
const AUTO_SYNC_MIN_AGE_MS = 30 * 60 * 1000
let autoSyncRunning: Promise<unknown> | null = null

/**
 * Lança a sincronização em segundo plano se a última tiver mais de 30 min.
 * Não bloqueia quem está a entrar; se já houver uma a correr, não lança outra.
 */
export async function syncInBackgroundIfStale(by: string) {
  if (!intranetConfigured() || autoSyncRunning) return
  try {
    const last = await getLastSync()
    if (last?.at && Date.now() - new Date(last.at).getTime() < AUTO_SYNC_MIN_AGE_MS) return
    autoSyncRunning = syncFromIntranet(`${by} (automático no login)`)
      .then((r) => { if (!r.ok) console.error('Sincronização automática Intranet falhou:', r.error) })
      .catch((e) => console.error('Sincronização automática Intranet falhou:', e))
      .finally(() => { autoSyncRunning = null })
  } catch (e) {
    console.error('Erro a verificar a última sincronização:', e)
  }
}

/** Se houver uma sincronização automática a correr, espera que termine (evita duas em simultâneo) */
export async function waitForAutoSync() {
  if (autoSyncRunning) await autoSyncRunning
  return autoSyncRunning === null
}

// ---------------------------------------------------------------------------
// Lista de clientes do formulário (nomes da Intranet)
// ---------------------------------------------------------------------------

export type ClientOption = { value: string; label: string; hint?: string }

/** Valor usado no formulário para uma conta da Intranet que ainda não tem cliente na BD */
export const PENDING_PREFIX = 'intranet:'

/**
 * Clientes para o formulário: os ligados à Intranet (com o nome da Intranet) + as contas da Intranet
 * ainda por associar (o cliente é criado ao gravar). Os clientes que só existem na folha antiga
 * deixam de aparecer — exceto o cliente atual do registo que se está a editar.
 * Sem nenhuma sincronização feita, mostra todos os clientes como antes.
 */
export async function getClientOptions(currentClientId?: string | null): Promise<ClientOption[]> {
  const linked = await sql<{ id: string; name: string; venda_aluguer: string | null; n: number }[]>`
    select id, name, venda_aluguer, count(*) over (partition by intranet_account_id)::int as n
    from clients where intranet_account_id is not null and active order by lower(name)`
  if (linked.length === 0) {
    const all = await sql<{ id: string; name: string }[]>`select id, name from clients where active or id = ${currentClientId ?? null} order by lower(name)`
    return all.map(c => ({ value: c.id, label: c.name }))
  }
  const [pending, current] = await Promise.all([
    getPendingAccounts().then(r => r.pending.filter(p => p.status === 'pending')),
    currentClientId && !linked.some(c => c.id === currentClientId)
      ? sql<{ id: string; name: string }[]>`select id, name from clients where id = ${currentClientId}`
      : Promise.resolve([] as { id: string; name: string }[]),
  ])
  const opts: ClientOption[] = [
    // conta com vários clientes (ex.: venda e aluguer): mostra a modalidade para distinguir
    ...linked.map(c => ({ value: c.id, label: c.n > 1 ? `${c.name} · ${c.venda_aluguer || 'sem modalidade'}` : c.name })),
    ...pending.map(p => ({
      value: PENDING_PREFIX + p.intranet_account_id,
      label: p.name,
      hint: p.suggestion
        ? `Conta da Intranet ainda sem cliente na BD. Parece ser "${p.suggestion.name}" (da folha antiga) — se for, associe-a em Definições › Intranet antes de gravar, para não duplicar o cliente.`
        : 'Conta da Intranet ainda sem cliente na BD — o cliente é criado automaticamente ao gravar.',
    })),
    ...current.map(c => ({ value: c.id, label: `${c.name} (sem ligação à Intranet)` })),
  ]
  return opts.sort((a, b) => a.label.localeCompare(b.label, 'pt'))
}

/** Converte o valor escolhido no formulário no id do cliente (cria o cliente a partir da conta da Intranet, se preciso) */
export async function resolveClientId(value: string): Promise<string> {
  if (!value.startsWith(PENDING_PREFIX)) return value
  const intranetId = value.slice(PENDING_PREFIX.length)
  const find = async () => {
    const [c] = await sql<{ id: string }[]>`select id from clients where intranet_account_id = ${intranetId} order by created_at limit 1`
    return c?.id
  }
  let id = await find()
  if (id) return id
  await createFromPending([intranetId])
  id = await find()
  if (id) return id
  // já existia um cliente com o mesmo nome (ligado a outra conta) → usa esse
  const [p] = await sql<{ name: string }[]>`select name from intranet_pending where intranet_account_id = ${intranetId}`
  const [same] = p ? await sql<{ id: string }[]>`select id from clients where lower(name) = lower(${p.name})` : []
  if (same) return same.id
  throw new Error('Não foi possível criar o cliente a partir da Intranet. Sincronize de novo e tente outra vez.')
}

// ---------------------------------------------------------------------------
// Escrita na Intranet (só usada por ações de SUPER ADMIN — ver src/actions/intranet-write.ts)
// ---------------------------------------------------------------------------

export type IntranetDeviceUpdate = { imei: string; plate: string; accountId?: string | null; accountName?: string | null }
export type IntranetUpdateResult = { imei: string; ok: boolean; error?: string; plate?: string; before?: { plate: string | null; accountId: string | null } }

/**
 * Altera matrícula (e opcionalmente a conta) de equipamentos na Intranet: PUT /api/devices/{vehicleId}.
 * Lê o objeto atual de cada equipamento (lista /api/devices), muda SÓ a matrícula e a conta e envia o objeto completo de volta.
 */
export async function updateIntranetDevices(items: IntranetDeviceUpdate[]): Promise<IntranetUpdateResult[]> {
  if (!items.length) return []
  const token = await login()
  try {
    const raw = asList(await getJson('/api/devices', token))
    const byImei = new Map<string, Json>()
    for (const d of raw) {
      const imei = pick(d, ['imei', 'IMEI', 'Imei', 'deviceImei'])
      if (imei) byImei.set(imei, d)
    }
    const out: IntranetUpdateResult[] = []
    for (const it of items) {
      const obj = byImei.get(it.imei)
      const vid = obj ? pick(obj, ['vehicleId', 'VehicleId', 'vehicle.id', 'id']) : null
      if (!obj || !vid) { out.push({ imei: it.imei, ok: false, error: obj ? 'sem vehicleId na Intranet' : 'IMEI não encontrado na Intranet' }); continue }
      const plateKey = ['licensePlate', 'LicensePlate', 'vehicleLicensePlate'].find((k) => k in obj) ?? 'licensePlate'
      const before = { plate: pick(obj, [plateKey]), accountId: pick(obj, ['accountId', 'AccountId']) }
      // objeto completo do equipamento (a lista pode vir resumida); se não houver GET individual, usa o da lista
      let full: Json | null = null
      const tries: string[] = []
      for (const path of [`/api/devices/details/${encodeURIComponent(vid)}`]) {
        try {
          const one = await getJson(path, token)
          const o = Array.isArray(one) ? (one as Json[]).find((x) => pick(x, ['imei', 'IMEI']) === it.imei) : asList(one).length ? asList(one).find((x) => pick(x, ['imei', 'IMEI']) === it.imei) : one
          if (o && typeof o === 'object') { full = { ...obj, ...(o as Json) }; break }
        } catch (e) { tries.push(`${path.split('?')[0]}: ${(e as Error).message.slice(0, 60)}`) }
      }
      // a lista geral serve se trouxer os campos sensíveis (MSISDN, operador GSM)
      const has = (o: Json, ks: string[]) => ks.some((k) => k in o)
      if (!full && has(obj, ['msisdn', 'MSISDN', 'Msisdn']) && has(obj, ['gsmOperator', 'GsmOperator'])) full = obj
      // sem a leitura completa do equipamento não se envia nada (podia apagar MSISDN, operador GSM, PIN…)
      if (!full) {
        out.push({ imei: it.imei, ok: false, error: `não foi possível ler o equipamento completo na Intranet — nada alterado. Campos da lista: ${Object.keys(obj).slice(0, 40).join(', ')}${tries.length ? ' · ' + tries.join(' | ') : ''}` })
        continue
      }
      const keep = (o: Json) => ({ msisdn: pick(o, ['msisdn', 'MSISDN', 'Msisdn']), gsm: pick(o, ['gsmOperator', 'GsmOperator', 'gsm_operator']), pin: pick(o, ['pin', 'PIN', 'Pin']) })
      const kept = keep(full)
      // {OP} na matrícula → operador do cartão na Intranet (gsmOperator): NOS ou VDF
      let plate = it.plate
      if (plate.includes('{OP}')) {
        const g = pick(full, ['gsmOperator', 'GsmOperator']) ?? ''
        const op = /vodafone|\bvdf/i.test(g) ? 'VDF' : /\bnos\b|optimus|zon/i.test(g) ? 'NOS' : null
        if (!op) { out.push({ imei: it.imei, ok: false, error: `operador GSM "${g || 'vazio'}" não é NOS nem Vodafone — nada alterado` }); continue }
        plate = plate.replace('{OP}', op)
      }
      const body: Json = { ...full, [plateKey]: plate }
      // PIN: a Intranet exige 4 dígitos (opcionalmente com *), "*" ou "----". Se vier vazio/mascarado/inválido, envia "----".
      for (const k of Object.keys(body)) {
        if (k.toLowerCase() !== 'pin') continue
        const v = body[k] == null ? '' : String(body[k]).trim()
        if (!/^(\*?\d{4}|\*|----)$/.test(v)) body[k] = '----'
      }
      if (!Object.keys(body).some((k) => k.toLowerCase() === 'pin')) body.pin = '----'
      const url = `${baseUrl()}/api/devices/${encodeURIComponent(vid)}?uniqueLicensePlate=false&api_key=${encodeURIComponent(token)}`
      const json = JSON.stringify(body)
      let res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json-patch+json' }, body: json, cache: 'no-store' })
      if (res.status === 415) res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json, cache: 'no-store' })
      if (!res.ok) { out.push({ imei: it.imei, ok: false, before, error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` }); continue }
      // mudança de conta: pedido próprio (POST /api/devices/transfer), sem apagar dados (clearData: false)
      let transferError: string | null = null
      if (it.accountId && String(before.accountId ?? '') !== String(it.accountId)) {
        const tr = await fetch(`${baseUrl()}/api/devices/transfer?api_key=${encodeURIComponent(token)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ vehicleIds: [/^\d+$/.test(vid) ? Number(vid) : vid], destinationAccountId: String(it.accountId),
            transferNotes: 'Transferido pela app Gestão de Intervenções', clearData: false }),
        })
        if (!tr.ok) transferError = `matrícula alterada, mas a transferência de conta falhou: HTTP ${tr.status} ${(await tr.text()).slice(0, 160)}`
      }
      // lê de novo o equipamento: confirma o que mudou mesmo (matrícula, conta) e que MSISDN/operador ficaram iguais
      let after: Json | null = null
      try { after = await getJson(`/api/devices/details/${encodeURIComponent(vid)}`, token) as Json } catch { /* sem verificação */ }
      const plateNow = after ? pick(after, [plateKey]) : plate
      const accNow = after ? pick(after, ['accountId', 'AccountId']) : (it.accountId ?? before.accountId)
      await sql`update devices set license_plate = ${plateNow}, intranet_device_id = coalesce(intranet_device_id, ${vid})
                ${accNow ? sql`, intranet_account_id = ${accNow}` : sql``} where imei = ${it.imei}`
      const problems: string[] = []
      if (after) {
        const k2 = keep(after)
        if (k2.msisdn !== kept.msisdn) problems.push(`ATENÇÃO: MSISDN mudou (antes ${kept.msisdn ?? '—'})`)
        if (k2.gsm !== kept.gsm) problems.push(`ATENÇÃO: operador GSM mudou (antes ${kept.gsm ?? '—'})`)
        if (plateNow !== plate) problems.push('a matrícula não mudou')
        if (!transferError && it.accountId && String(accNow) !== String(it.accountId)) problems.push('a matrícula mudou, mas a CONTA NÃO MUDOU')
      }
      if (transferError) problems.unshift(transferError)
      out.push(problems.length ? { imei: it.imei, ok: false, before, plate, error: problems.join(' · ') } : { imei: it.imei, ok: true, before, plate })
    }
    return out
  } finally {
    await logout(token)
  }
}

/**
 * Operador GSM (gsmOperator) de cada IMEI, lido nos detalhes de cada equipamento na Intranet e guardado em devices.gsm_operator.
 * Só leitura na Intranet. Usado na pré-visualização das matrículas XX_Ay_ZZZ_12345.
 */
export async function fetchGsmOperators(imeis: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  if (!imeis.length || !intranetConfigured()) return out
  const token = await login()
  try {
    const known = await sql<{ imei: string; vid: string | null }[]>`select imei, intranet_device_id as vid from devices where imei = any(${imeis})`
    const vidOf = new Map(known.filter((k) => k.vid).map((k) => [k.imei, k.vid!]))
    if (imeis.some((i) => !vidOf.has(i))) {
      for (const d of asList(await getJson('/api/devices', token))) {
        const imei = pick(d, ['imei', 'IMEI', 'Imei']); const vid = pick(d, ['vehicleId', 'VehicleId', 'vehicle.id', 'id'])
        if (imei && vid && imeis.includes(imei)) vidOf.set(imei, vid)
      }
    }
    const queue = imeis.filter((i) => vidOf.has(i))
    const worker = async () => {
      for (let imei = queue.shift(); imei; imei = queue.shift()) {
        try {
          const det = await getJson(`/api/devices/details/${encodeURIComponent(vidOf.get(imei)!)}`, token) as Json
          const g = pick(det, ['gsmOperator', 'GsmOperator'])
          out.set(imei, g)
          await sql`update devices set gsm_operator = ${g}, intranet_device_id = coalesce(intranet_device_id, ${vidOf.get(imei)!}) where imei = ${imei}`
        } catch { /* ignora este */ }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))
    return out
  } finally {
    await logout(token)
  }
}

// ---------------------------------------------------------------------------
// Firmware (só usado por ações de SUPER ADMIN — ver src/actions/firmware.ts)
// ---------------------------------------------------------------------------

export type FirmwareInfo = {
  imei: string; vehicleId: string | null; hardware: string | null; firmware: string | null
  available: string | null; availableId: number | null; lastUpgrade: string | null
  canFirmware: string | null; canAvailable: string | null; canAvailableId: number | null; error?: string
  /** data da última comunicação do equipamento (se a Intranet a devolver) */
  lastComm?: string | null
  /** último pedido de atualização registado na Intranet (estado e data) */
  lastOp?: { status: string | null; requested: string | null; firmware: string | null } | null
}

/** Lê nos detalhes de cada equipamento (Intranet) a versão de firmware e a atualização disponível */
export async function getFirmwareInfo(imeis: string[], kind: 'device' | 'canadapter' = 'device'): Promise<FirmwareInfo[]> {
  if (!imeis.length) return []
  const token = await login()
  try {
    const known = await sql<{ imei: string; vid: string | null }[]>`select imei, intranet_device_id as vid from devices where imei = any(${imeis})`
    const vidOf = new Map(known.filter((k) => k.vid).map((k) => [k.imei, k.vid!]))
    if (imeis.some((i) => !vidOf.has(i))) {
      for (const d of asList(await getJson('/api/devices', token))) {
        const imei = pick(d, ['imei', 'IMEI', 'Imei']); const vid = pick(d, ['vehicleId', 'VehicleId', 'vehicle.id', 'id'])
        if (imei && vid && imeis.includes(imei)) vidOf.set(imei, vid)
      }
    }
    const num = (v: string | null) => (v && /^\d+$/.test(v) && v !== '0' ? Number(v) : null)
    const out: FirmwareInfo[] = []
    const queue = [...imeis]
    const worker = async () => {
      for (let imei = queue.shift(); imei; imei = queue.shift()) {
        const vid = vidOf.get(imei) ?? null
        if (!vid) { out.push({ imei, vehicleId: null, hardware: null, firmware: null, available: null, availableId: null, lastUpgrade: null, canFirmware: null, canAvailable: null, canAvailableId: null, error: 'não encontrado na Intranet' }); continue }
        try {
          const d = await getJson(`/api/devices/details/${encodeURIComponent(vid)}`, token) as Json
          out.push({
            imei, vehicleId: vid, hardware: pick(d, ['hardware']), firmware: pick(d, ['firmwareVersion']),
            available: pick(d, ['availableUpgrade']), availableId: num(pick(d, ['availableUpgradeFirmwareId'])),
            lastUpgrade: pick(d, ['lastFirmwareUpgrade']),
            canFirmware: pick(d, ['canAdapterFirmwareVersion']), canAvailable: pick(d, ['canAdapterAvailableUpgrade']),
            canAvailableId: num(pick(d, ['canAdapterAvailableUpgradeFirmwareId'])),
            lastOp: await lastOperation(imei, kind, token),
            lastComm: lastCommOf(d),
          })
        } catch (e) {
          out.push({ imei, vehicleId: vid, hardware: null, firmware: null, available: null, availableId: null, lastUpgrade: null, canFirmware: null, canAvailable: null, canAvailableId: null, error: (e as Error).message.slice(0, 120) })
        }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))
    return out
  } finally {
    await logout(token)
  }
}

/** Última comunicação nos detalhes do equipamento: nomes conhecidos e, se não houver, qualquer campo "last…" com data */
function lastCommOf(d: Json): string | null {
  const known = pick(d, ['lastRegDate', 'lastValidGPS', 'lastCommunication', 'lastCommunicationDate', 'lastCommunicationTime', 'lastConnection', 'lastConnectionDate',
    'lastContact', 'lastContactDate', 'lastSeen', 'lastReport', 'lastReportDate', 'lastPositionDate', 'lastPosition.date', 'lastGpsDate', 'lastDataReceived'])
  if (known) return known
  for (const [k, v] of Object.entries(d ?? {})) {
    if (/last.*(comm|conn|contact|seen|report|position|gps|data|messag)/i.test(k) && typeof v === 'string' && !isNaN(Date.parse(v))) return v
  }
  return null
}

/** Último pedido de atualização (GET /api/devices/details/operations/{imei}[/canadapter]) — null se não houver ou não der para ler */
async function lastOperation(imei: string, kind: 'device' | 'canadapter', token: string) {
  try {
    const raw = await getJson(`/api/devices/details/operations/${encodeURIComponent(imei)}${kind === 'canadapter' ? '/canadapter' : ''}`, token)
    const list = Array.isArray(raw) ? (raw as Json[]) : asList(raw).length ? asList(raw) : raw && typeof raw === 'object' ? [raw as Json] : []
    const when = (o: Json) => pick(o, ['requested', 'requestedDate', 'requestDate', 'creation', 'createdAt', 'date']) ?? ''
    const last = [...list].sort((a, b) => when(b).localeCompare(when(a)))[0]
    if (!last) return null
    return { status: pick(last, ['status', 'Status', 'state', 'operationStatus']), requested: when(last) || null,
             firmware: pick(last, ['requestedFirmwareVersion', 'firmwareUpdate', 'newFirmware', 'firmware']) }
  } catch { return null }
}

/** Pede a atualização de firmware: equipamento (POST /api/devices/details/operations) ou CAN chip (…/operations/canadapter) */
export async function requestFirmwareUpgrades(items: { imei: string; firmwareId: number; requested: string; previous: string | null; reason: string }[], kind: 'device' | 'canadapter' = 'device') {
  if (!items.length) return [] as { imei: string; ok: boolean; error?: string }[]
  const token = await login()
  try {
    const out: { imei: string; ok: boolean; error?: string }[] = []
    for (const it of items) {
      const res = await fetch(`${baseUrl()}/api/devices/details/operations${kind === 'canadapter' ? '/canadapter' : ''}?api_key=${encodeURIComponent(token)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
        body: JSON.stringify({ imei: it.imei, reason: it.reason, requestedFirmwareVersion: it.requested, previousFirmwareVersion: it.previous ?? '', firmwareId: it.firmwareId }),
      })
      out.push(res.ok ? { imei: it.imei, ok: true } : { imei: it.imei, ok: false, error: `HTTP ${res.status} ${(await res.text()).slice(0, 200)}` })
    }
    return out
  } finally {
    await logout(token)
  }
}
