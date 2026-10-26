'use server'

import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/auth'
import { equipmentNamer } from '@/lib/equipment-namer'
import { getFirmwareInfo, requestFirmwareUpgrades } from '@/lib/intranet'

/** Modelos com atualização de firmware pela app */
const FIRMWARE_MODELS = ['FMC640', 'FMC650', 'FMC130', 'FMC150', 'C4MAX V8']
/** CAN chip / CAN adapter: só FMC150 */
const CAN_MODELS = ['FMC150']
export type FirmwareKind = 'device' | 'canadapter'

export type FirmwareRow = {
  imei: string; warehouse: string | null; equipment: string | null; firmware: string | null
  available: string | null; availableId: number | null; issue: string | null
}

async function previewCore(input: { warehouseIds: string[]; imeis: string; kind?: FirmwareKind }): Promise<FirmwareRow[]> {
  const can = input.kind === 'canadapter'
  const MODELS = can ? CAN_MODELS : FIRMWARE_MODELS
  const list = [...new Set(input.imeis.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{14,15}$/.test(x)).map((x) => (x.length === 14 ? '0' + x : x)))]
  if (!input.warehouseIds.length && !list.length) return []
  const rows = await sql<{ imei: string; warehouse: string | null; equipment: string | null; hardware: string | null }[]>`
    select c.imei, w.name as warehouse, e.name as equipment, d.model as hardware
    from stock_current c
    join warehouses w on w.id = c.warehouse_id
    left join equipment_list e on e.id = c.equipment_id
    left join devices d on d.imei = c.imei
    where (${input.warehouseIds.length ? sql`c.warehouse_id = any(${input.warehouseIds})` : sql`false`}
           or ${list.length ? sql`c.imei = any(${list})` : sql`false`})
    order by w.name, c.imei`
  const eqName = await equipmentNamer()
  const base = rows.map((r) => ({ ...r, equipment: eqName(r.hardware) ?? r.equipment }))
  const allowed = (e: string | null) => !!e && MODELS.includes(e.toUpperCase())
  // só se lê na Intranet os modelos abrangidos (máx. 300 de cada vez)
  const toRead = base.filter((r) => allowed(r.equipment)).map((r) => r.imei).slice(0, 300)
  const info = new Map((await getFirmwareInfo(toRead)).map((i) => [i.imei, i]))
  const out: FirmwareRow[] = base.map((r) => {
    const i = info.get(r.imei)
    let issue: string | null = null
    if (!allowed(r.equipment)) issue = `Modelo não abrangido (${MODELS.join(', ')})`
    else if (!i) issue = 'Não lido (limite de 300 por pré-visualização)'
    else if (i.error) issue = i.error
    const cur = can ? i?.canFirmware : i?.firmware, av = can ? i?.canAvailable : i?.available, avId = can ? i?.canAvailableId : i?.availableId
    if (!issue && (!avId || !av)) issue = 'Sem atualização disponível'
    else if (!issue && av === cur) issue = 'Já atualizado'
    return { imei: r.imei, warehouse: r.warehouse, equipment: r.equipment, firmware: cur ?? null, available: av ?? null, availableId: avId ?? null, issue }
  })
  const seen = new Set(out.map((r) => r.imei))
  for (const imei of list) if (!seen.has(imei)) out.unshift({ imei, warehouse: null, equipment: null, firmware: null, available: null, availableId: null, issue: 'Não está em stock na app' })
  out.sort((a, b) => Number(list.includes(b.imei)) - Number(list.includes(a.imei)))
  return out
}

/** Pré-visualização (só leitura na Intranet) */
export async function previewFirmware(input: { warehouseIds: string[]; imeis: string; kind?: FirmwareKind }) {
  await requireSuperAdmin()
  return previewCore(input)
}

/** Pede a atualização de firmware (SÓ super admin). Revalida tudo no servidor antes de enviar. */
export async function applyFirmware(input: { imeis: string[]; kind?: FirmwareKind }) {
  try {
    const user = await requireSuperAdmin()
    const kind: FirmwareKind = input.kind === 'canadapter' ? 'canadapter' : 'device'
    const rows = (await previewCore({ warehouseIds: [], imeis: input.imeis.join('\n'), kind })).filter((r) => !r.issue && r.availableId && r.available)
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
