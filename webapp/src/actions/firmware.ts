'use server'

import { sql } from '@/lib/db'
import { requirePerm, requireSuperAdmin, requireUser } from '@/lib/auth'
import { equipmentNamer } from '@/lib/equipment-namer'
import { getFirmwareInfo, getIgnition, requestFirmwareUpgrades } from '@/lib/intranet'

/** Modelos com atualização de firmware pela app */
const FIRMWARE_MODELS = ['FMC640', 'FMC650', 'FMC130', 'FMC150', 'C4MAX V8', 'C4MAX V4']
/** CAN chip / CAN adapter: só FMC150 */
const CAN_MODELS = ['FMC150']
export type FirmwareKind = 'device' | 'canadapter'

export type FirmwareRow = {
  imei: string; warehouse: string | null; equipment: string | null; firmware: string | null
  available: string | null; availableId: number | null; issue: string | null
  account: string | null; lastStatus: string | null; lastDate: string | null; lastComm?: string | null; ignition?: boolean | null
}

async function previewCore(input: { accountIds: string[]; imeis: string; kind?: FirmwareKind }): Promise<FirmwareRow[]> {
  const can = input.kind === 'canadapter'
  const MODELS = can ? CAN_MODELS : FIRMWARE_MODELS
  const list = [...new Set(input.imeis.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{14,15}$/.test(x)).map((x) => (x.length === 14 ? '0' + x : x)))]
  if (!input.accountIds.length && !list.length) return []
  // por CONTA da Intranet (todos os equipamentos ativos da conta, instalados ou em stock) e/ou IMEIs
  const rows = await sql<{ imei: string; warehouse: string | null; equipment: string | null; hardware: string | null; account: string | null }[]>`
    select d.imei, w.name as warehouse, e.name as equipment, d.model as hardware,
           coalesce(dc.intranet_short_name, dc.name, p.name) as account
    from devices d
    left join stock_current c on c.imei = d.imei
    left join warehouses w on w.id = c.warehouse_id
    left join equipment_list e on e.id = c.equipment_id
    left join clients dc on dc.intranet_account_id = d.intranet_account_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where d.active and (${input.accountIds.length ? sql`d.intranet_account_id = any(${input.accountIds})` : sql`false`}
           or ${list.length ? sql`d.imei = any(${list})` : sql`false`})
    order by 5, d.imei`
  const eqName = await equipmentNamer()
  const base = rows.map((r) => ({ ...r, equipment: eqName(r.hardware) ?? r.equipment }))
  // modelo abrangido: pelo equipamento da app OU pelo hardware da Intranet (ex.: "MD C4MAX V4 3GEU" → C4MAX V4)
  const fold = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const modelOf = (r: { equipment: string | null; hardware: string | null }) =>
    MODELS.find((m) => fold(m) === fold(r.equipment)) ??
    [...MODELS].sort((a, b) => b.length - a.length).find((m) => fold(r.hardware).includes(fold(m))) ?? null
  const allowedRow = (r: { equipment: string | null; hardware: string | null }) => !!modelOf(r)
  // só se lê na Intranet os modelos abrangidos (máx. 300 de cada vez)
  const toRead = base.filter((r) => allowedRow(r)).map((r) => r.imei).slice(0, 300)
  const [infoList, ign] = await Promise.all([getFirmwareInfo(toRead, can ? 'canadapter' : 'device'), getIgnition(toRead)])
  const info = new Map(infoList.map((i) => [i.imei, i]))
  const out: FirmwareRow[] = base.map((r) => {
    const i = info.get(r.imei)
    let issue: string | null = null
    if (!allowedRow(r)) issue = `Modelo não abrangido (${MODELS.join(', ')})`
    else if (!i) issue = 'Não lido (limite de 300 por pré-visualização)'
    else if (i.error) issue = i.error
    const cur = can ? i?.canFirmware : i?.firmware, av = can ? i?.canAvailable : i?.available, avId = can ? i?.canAvailableId : i?.availableId
    if (!issue && (!avId || !av)) issue = 'Sem atualização disponível'
    else if (!issue && av === cur) issue = 'Já atualizado'
    else if (!issue && i?.lastOp?.status && /pend|request|queue|progress|sent/i.test(i.lastOp.status)) issue = `Já tem um pedido pendente (${i.lastOp.firmware ?? ''})`
    return { imei: r.imei, warehouse: r.warehouse, equipment: modelOf(r) ?? r.equipment, firmware: cur ?? null, available: av ?? null, availableId: avId ?? null, issue,
             account: r.account, lastStatus: i?.lastOp?.status ?? null, lastDate: i?.lastOp?.requested ?? null, lastComm: i?.lastComm ?? null, ignition: ign.get(r.imei) ?? null }
  })
  const seen = new Set(out.map((r) => r.imei))
  for (const imei of list) if (!seen.has(imei)) out.unshift({ imei, warehouse: null, equipment: null, firmware: null, available: null, availableId: null, issue: 'Não existe na Intranet', account: null, lastStatus: null, lastDate: null })
  out.sort((a, b) => Number(list.includes(b.imei)) - Number(list.includes(a.imei)))
  // das contas só aparecem os que podem ser atualizados; os IMEIs colados à mão aparecem sempre (com o motivo, se não der)
  return out.filter((r) => !r.issue || list.includes(r.imei))
}

/** Pré-visualização (só leitura na Intranet) */
export async function previewFirmware(input: { accountIds: string[]; imeis: string; kind?: FirmwareKind }) {
  await requirePerm('equipment', 'read')
  return previewCore(input)
}

/** Pede a atualização de firmware (qualquer utilizador com acesso à app). Revalida tudo no servidor antes de enviar. */
export async function applyFirmware(input: { imeis: string[]; kind?: FirmwareKind }) {
  try {
    const user = await requirePerm('equipment', 'write')
    const kind: FirmwareKind = input.kind === 'canadapter' ? 'canadapter' : 'device'
    // evita pedidos repetidos (ex.: duplo clique): ignora IMEIs enviados há menos de 15 min ou já em espera
    const recent = new Set((await sql<{ imei: string }[]>`select imei from firmware_upgrade_log
      where kind = ${kind} and imei = any(${input.imeis}) and (queued or (ok and created_at > now() - interval '15 minutes'))`).map((r) => r.imei))
    const rows = (await previewCore({ accountIds: [], imeis: input.imeis.filter((i) => !recent.has(i)).join('\n'), kind })).filter((r) => !r.issue && r.availableId && r.available)
    if (!rows.length && recent.size) throw new Error('Estes equipamentos já têm o pedido enviado ou em espera.')
    if (!rows.length) throw new Error('Nada a atualizar (sem atualização disponível ou modelo não abrangido).')
    const reason = `Atualização de ${kind === 'canadapter' ? 'CAN chip' : 'firmware'} via Gestão de Intervenções (${user.email})`
    // só se envia com a ignição DESLIGADA; ligada ou desconhecida → fica em espera e a tarefa automática envia depois
    const now = rows.filter((r) => r.ignition === false)
    const wait = rows.filter((r) => r.ignition !== false)
    const res = await requestFirmwareUpgrades(now.map((r) => ({ imei: r.imei, firmwareId: r.availableId!, requested: r.available!, previous: r.firmware, reason })), kind)
    const logRow = (r: FirmwareRow, x: { ok: boolean; error?: string } | null) => ({
      imei: r.imei, kind, previous: r.firmware, requested: r.available, firmware_id: r.availableId, ok: x?.ok ?? false, error: x?.error ?? null,
      created_by: user.email, account: r.account, last_comm: r.lastComm ?? null, queued: !x, reason, sent_at: x ? new Date() : null,
    })
    const logs = [...res.map((x) => logRow(now.find((y) => y.imei === x.imei)!, x)), ...wait.map((r) => logRow(r, null))]
    if (logs.length) await sql`insert into firmware_upgrade_log ${sql(logs)}`
    return { ok: true as const, done: res.filter((x) => x.ok).length, queued: wait.length, failed: res.filter((x) => !x.ok) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

export type FirmwareLogRow = { id: string; imei: string; kind: string; queued: boolean; sent_at: Date | null; account: string | null; last_comm: string | null; result: string | null; result_at: Date | null; current_version: string | null; previous: string | null; requested: string | null; ok: boolean; error: string | null; created_by: string | null; created_at: Date }

/**
 * Verifica na Intranet se os pedidos enviados já ficaram instalados (só leitura). Só os pendentes dos últimos 60 dias,
 * no máximo 150 de cada vez; o resultado final fica guardado e não volta a ser lido.
 */
export async function refreshFirmwareResults() {
  await requireSuperAdmin()
  const pend = await sql<{ id: string; imei: string; kind: 'device' | 'canadapter'; requested: string | null; created_at: Date }[]>`
    select distinct on (imei, kind) id, imei, kind, requested, created_at from firmware_upgrade_log
    where ok and result is null and created_at > now() - interval '60 days'
    order by imei, kind, created_at desc limit 150`
  if (!pend.length) return 0
  let n = 0
  for (const kind of ['device', 'canadapter'] as const) {
    const items = pend.filter((p) => p.kind === kind)
    if (!items.length) continue
    const info = new Map((await getFirmwareInfo(items.map((p) => p.imei), kind).catch(() => [])).map((i) => [i.imei, i]))
    for (const p of items) {
      const i = info.get(p.imei)
      if (!i || i.error) continue
      const cur = kind === 'canadapter' ? i.canFirmware : i.firmware
      const st = i.lastOp?.status ?? ''
      // instalado quando a versão atual já é a pedida; falhado se a Intranet marcar o último pedido como erro/cancelado
      // a versão atual vem com várias partes (ex.: "D3.5.23 F0.47.9") e a pedida só com uma ("F0.47.9")
      const parts = (v: string) => v.toUpperCase().split(/[\s,;/|]+/).filter(Boolean)
      const installed = !!cur && !!p.requested && parts(p.requested).every((x) => parts(cur).includes(x))
      const result = installed ? 'updated'
        : /fail|error|erro|cancel|reject|abort/i.test(st) ? 'failed' : null
      await sql`update firmware_upgrade_log set current_version = ${cur ?? null}, last_comm = coalesce(${i.lastComm ?? null}, last_comm),
                result = ${result}, result_at = ${result ? sql`now()` : null}
                where imei = ${p.imei} and kind = ${kind} and ok and result is null and created_at <= ${p.created_at}`
      if (result) n++
    }
  }
  return n
}

/** Histórico de pedidos de atualização (só o super admin) */
export async function getFirmwareHistory(f: { q?: string; kind?: string; from?: string; to?: string } = {}) {
  await requireSuperAdmin()
  const q = (f.q ?? '').trim()
  const like = `%${q}%`
  return sql<FirmwareLogRow[]>`
    select l.id, l.imei, l.kind, l.queued, l.sent_at, l.previous, l.requested, l.ok, l.error, l.created_by, l.created_at, l.last_comm, l.result, l.result_at, l.current_version,
           coalesce(l.account, dc.intranet_short_name, dc.name, p.name) as account
    from firmware_upgrade_log l
    left join devices d on d.imei = l.imei
    left join lateral (select intranet_short_name, name from clients c where c.intranet_account_id = d.intranet_account_id
                       order by intranet_synced_at nulls last limit 1) dc on true
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where (${q} = '' or l.imei ilike ${like} or coalesce(l.created_by, '') ilike ${like}
           or coalesce(l.account, dc.intranet_short_name, dc.name, p.name, '') ilike ${like})
      and (${f.kind ?? ''} = '' or l.kind = ${f.kind ?? ''})
      and (${f.from ?? ''} = '' or l.created_at >= ${f.from || '1970-01-01'}::date)
      and (${f.to ?? ''} = '' or l.created_at < ${f.to || '1970-01-01'}::date + 1)
    order by l.created_at desc
    limit 500`
}
