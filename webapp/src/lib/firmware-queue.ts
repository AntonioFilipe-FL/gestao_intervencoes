import 'server-only'
import { sql } from '@/lib/db'
import { getIgnition, requestFirmwareUpgrades } from '@/lib/intranet'

/** Dias que um pedido fica em espera; depois expira (a ignição nunca desligou ou o equipamento não comunicou) */
const MAX_WAIT_DAYS = 7

/**
 * Envia os pedidos em espera cujo equipamento já tem a ignição desligada.
 * Chamado pela tarefa automática (/api/cron/firmware-queue). Devolve quantos foram enviados.
 */
export async function processFirmwareQueue() {
  await sql`update firmware_upgrade_log set queued = false, error = ${`Expirou: a ignição não desligou em ${MAX_WAIT_DAYS} dias`}
            where queued and created_at < now() - make_interval(days => ${MAX_WAIT_DAYS})`
  const rows = await sql<{ id: string; imei: string; kind: 'device' | 'canadapter'; firmware_id: number | null; requested: string | null; previous: string | null; reason: string | null }[]>`
    select id, imei, kind, firmware_id, requested, previous, reason from firmware_upgrade_log where queued order by created_at limit 300`
  if (!rows.length) return { sent: 0, waiting: 0 }
  const ign = await getIgnition([...new Set(rows.map((r) => r.imei))])
  const ready = rows.filter((r) => ign.get(r.imei) === false)
  let sent = 0
  for (const kind of ['device', 'canadapter'] as const) {
    const items = ready.filter((r) => r.kind === kind)
    if (!items.length) continue
    const bad = items.filter((r) => !r.firmware_id || !r.requested)
    for (const b of bad) await sql`update firmware_upgrade_log set queued = false, error = 'Pedido incompleto (sem firmware)' where id = ${b.id}`
    const good = items.filter((r) => r.firmware_id && r.requested)
    const res = await requestFirmwareUpgrades(good.map((r) => ({
      imei: r.imei, firmwareId: r.firmware_id!, requested: r.requested!, previous: r.previous, reason: r.reason ?? 'Atualização via Gestão de Intervenções',
    })), kind)
    for (const x of res) {
      const r = good.find((g) => g.imei === x.imei)!
      await sql`update firmware_upgrade_log set queued = false, ok = ${x.ok}, error = ${x.error ?? null}, sent_at = now() where id = ${r.id}`
      if (x.ok) sent++
    }
  }
  return { sent, waiting: rows.length - ready.length }
}
