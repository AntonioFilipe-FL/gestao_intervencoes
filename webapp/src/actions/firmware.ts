'use server'

import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/auth'
import { equipmentNamer } from '@/lib/equipment-namer'
import { getFirmwareInfo, requestFirmwareUpgrades } from '@/lib/intranet'

/** Modelos com atualização de firmware pela app */
const FIRMWARE_MODELS = ['FMC640', 'FMC650', 'FMC130', 'FMC150', 'C4MAX V8', 'C4MAX V4']
/** CAN chip / CAN adapter: só FMC150 */
const CAN_MODELS = ['FMC150']
export type FirmwareKind = 'device' | 'canadapter'

export type FirmwareRow = {
  imei: string; warehouse: string | null; equipment: string | null; firmware: string | null
  available: string | null; availableId: number | null; issue: string | null
  account: string | null; lastStatus: string | null; lastDate: string | null
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
  const allowed = (e: string | null) => !!e && MODELS.includes(e.toUpperCase())
  // só se lê na Intranet os modelos abrangidos (máx. 300 de cada vez)
  const toRead = base.filter((r) => allowed(r.equipment)).map((r) => r.imei).slice(0, 300)
  const info = new Map((await getFirmwareInfo(toRead, can ? 'canadapter' : 'device')).map((i) => [i.imei, i]))
  const out: FirmwareRow[] = base.map((r) => {
    const i = info.get(r.imei)
    let issue: string | null = null
    if (!allowed(r.equipment)) issue = `Modelo não abrangido (${MODELS.join(', ')})`
    else if (!i) issue = 'Não lido (limite de 300 por pré-visualização)'
    else if (i.error) issue = i.error
    const cur = can ? i?.canFirmware : i?.firmware, av = can ? i?.canAvailable : i?.available, avId = can ? i?.canAvailableId : i?.availableId
    if (!issue && (!avId || !av)) issue = 'Sem atualização disponível'
    else if (!issue && av === cur) issue = 'Já atualizado'
    else if (!issue && i?.lastOp?.status && /pend|request|queue|progress|sent/i.test(i.lastOp.status)) issue = `Já tem um pedido pendente (${i.lastOp.firmware ?? ''})`
    return { imei: r.imei, warehouse: r.warehouse, equipment: r.equipment, firmware: cur ?? null, available: av ?? null, availableId: avId ?? null, issue,
             account: r.account, lastStatus: i?.lastOp?.status ?? null, lastDate: i?.lastOp?.requested ?? null }
  })
  const seen = new Set(out.map((r) => r.imei))
  for (const imei of list) if (!seen.has(imei)) out.unshift({ imei, warehouse: null, equipment: null, firmware: null, available: null, availableId: null, issue: 'Não existe na Intranet', account: null, lastStatus: null, lastDate: null })
  out.sort((a, b) => Number(list.includes(b.imei)) - Number(list.includes(a.imei)))
  // das contas só aparecem os que podem ser atualizados; os IMEIs colados à mão aparecem sempre (com o motivo, se não der)
  return out.filter((r) => !r.issue || list.includes(r.imei))
}

/** Pré-visualização (só leitura na Intranet) */
export async function previewFirmware(input: { accountIds: string[]; imeis: string; kind?: FirmwareKind }) {
  await requireSuperAdmin()
  return previewCore(input)
}

/** Pede a atualização de firmware (SÓ super admin). Revalida tudo no servidor antes de enviar. */
export async function applyFirmware(input: { imeis: string[]; kind?: FirmwareKind }) {
  try {
    const user = await requireSuperAdmin()
    const kind: FirmwareKind = input.kind === 'canadapter' ? 'canadapter' : 'device'
    const rows = (await previewCore({ accountIds: [], imeis: input.imeis.join('\n'), kind })).filter((r) => !r.issue && r.availableId && r.available)
    if (!rows.length) throw new Error('Nada a atualizar (sem atualização disponível ou modelo não abrangido).')
    const res = await requestFirmwareUpgrades(rows.map((r) => ({
      imei: r.imei, firmwareId: r.availableId!, requested: r.available!, previous: r.firmware, reason: `Atualização de ${kind === 'canadapter' ? 'CAN chip' : 'firmware'} via Gestão de Intervenções (${user.email})`,
    })), kind)
    await sql`insert into firmware_upgrade_log ${sql(res.map((x) => {
      const r = rows.find((y) => y.imei === x.imei)!
      return { imei: x.imei, kind, previous: r.firmware, requested: r.available, firmware_id: r.availableId, ok: x.ok, error: x.error ?? null, created_by: user.email }
    }))}`
    return { ok: true as const, done: res.filter((x) => x.ok).length, failed: res.filter((x) => !x.ok) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}
