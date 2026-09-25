'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin, requireUser } from '@/lib/auth'
import { syncFromIntranet, waitForAutoSync, linkAdditionalClient, unlinkClient, linkPending, createFromPending, setPendingStatus, revertAutoCreatedClients } from '@/lib/intranet'

/** Sincronizar clientes e IMEIs a partir da Intranet (só admins) */
export async function runIntranetSync() {
  const user = await requireAdmin()
  await waitForAutoSync()
  const r = await syncFromIntranet(user.email)
  revalidatePath('/settings')
  revalidatePath('/interventions/new')
  return r
}

export type DeviceOption = { imei: string; model: string | null; license_plate: string | null }

/** IMEIs ativos de um cliente (para o campo IMEI do formulário) */
export async function getClientDevices(clientId: string): Promise<DeviceOption[]> {
  await requireUser()
  // conta da Intranet ainda sem cliente na BD → IMEIs dessa conta
  const pending = /^intranet:([\w-]+)$/.exec(clientId)
  if (pending)
    return sql<DeviceOption[]>`select imei, model, license_plate from devices
                               where intranet_account_id = ${pending[1]} and active order by license_plate nulls last, imei`
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return []
  // todos os IMEIs da conta da Intranet do cliente (a conta pode ter vários clientes: venda/aluguer)
  return sql<DeviceOption[]>`select imei, model, license_plate from devices
                             where active and (client_id = ${clientId}
                               or intranet_account_id = (select intranet_account_id from clients where id = ${clientId}))
                             order by license_plate nulls last, imei`
}

export type ImeiLookup =
  | { found: false }
  | { found: true; clientId: string | null; clientName: string | null; accountId: string | null; accountClientIds: string[]; model: string | null; license_plate: string | null; active: boolean }

/** Verifica um IMEI na lista sincronizada da Intranet */
export async function lookupImei(imei: string): Promise<ImeiLookup> {
  await requireUser()
  const v = imei.replace(/\s/g, '')
  if (!/^\d{8,20}$/.test(v)) return { found: false }
  const [d] = await sql`select d.client_id, c.name as client_name, d.intranet_account_id, d.model, d.license_plate, d.active,
                          coalesce((select array_agg(o.id) from clients o where o.intranet_account_id = d.intranet_account_id), '{}') as account_client_ids
                        from devices d left join clients c on c.id = d.client_id where d.imei = ${v}`
  return d
    ? { found: true, clientId: d.client_id, clientName: d.client_name, accountId: d.intranet_account_id, accountClientIds: d.account_client_ids,
        model: d.model, license_plate: d.license_plate, active: d.active }
    : { found: false }
}

/** Pesquisa global de IMEIs (para "IMEI equipamento gasto") */
export async function searchDevices(q: string): Promise<(DeviceOption & { client_name: string | null })[]> {
  await requireUser()
  const v = q.replace(/\s/g, '')
  if (v.length < 4) return []
  return sql`select d.imei, d.model, d.license_plate, c.name as client_name from devices d
             left join clients c on c.id = d.client_id
             where d.active and (d.imei like ${'%' + v + '%'} or upper(d.license_plate) like ${'%' + v.toUpperCase() + '%'})
             order by d.imei limit 20`
}

/** Resolver uma conta da Intranet sem correspondência */
export async function resolvePending(
  intranetIds: string[],
  action: { type: 'link'; clientId: string } | { type: 'create' } | { type: 'ignore' } | { type: 'restore' }
) {
  try {
    await requireAdmin()
    if (action.type === 'link') {
      if (intranetIds.length !== 1) throw new Error('Associe uma conta de cada vez.')
      await linkPending(intranetIds[0], action.clientId)
    } else if (action.type === 'create') {
      const n = await createFromPending(intranetIds)
      if (n < intranetIds.length) {
        revalidatePath('/settings')
        return { ok: true as const, warning: `${intranetIds.length - n} não foram criadas porque já existe um cliente com o mesmo nome — associe-as manualmente.` }
      }
    } else {
      await setPendingStatus(intranetIds, action.type === 'ignore' ? 'ignored' : 'pending')
    }
    revalidatePath('/settings')
    revalidatePath('/interventions/new')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** Liga mais um cliente da BD a uma conta da Intranet (ex.: venda + aluguer) */
export async function linkAnotherClient(intranetId: string, clientId: string) {
  try {
    await requireAdmin()
    await linkAdditionalClient(intranetId, clientId)
    revalidatePath('/settings')
    revalidatePath('/interventions/new')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** Desliga um cliente da conta da Intranet */
export async function unlinkIntranetClient(clientId: string) {
  try {
    await requireAdmin()
    await unlinkClient(clientId)
    revalidatePath('/settings')
    revalidatePath('/interventions/new')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** Devolve à lista "Por associar" os clientes criados automaticamente (sem intervenções nem dados próprios) */
export async function revertAutoCreated() {
  try {
    await requireAdmin()
    const n = await revertAutoCreatedClients()
    revalidatePath('/settings')
    return { ok: true as const, n }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

export type PlateImeis = {
  current: { imei: string; model: string | null; client_name: string | null } | null
  previous: { imei: string; source: 'intranet' | 'registo'; date: string | null; model: string | null } | null
}

/**
 * Para uma matrícula: IMEI atual (Intranet) e IMEI anterior.
 * IMEI anterior = último do histórico de sincronizações diferente do atual; se não houver,
 * o último IMEI registado numa intervenção dessa matrícula que seja diferente do atual.
 */
export async function getPlateImeis(plate: string): Promise<PlateImeis> {
  await requireUser()
  const p = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()
  if (p.length < 4) return { current: null, previous: null }

  const [cur] = await sql`select d.imei, d.model, c.name as client_name from devices d left join clients c on c.id = d.client_id
                          where d.active and gestao_interv.plate_norm(d.license_plate) = ${p}
                          order by d.synced_at desc limit 1`
  const currentImei: string | null = cur?.imei ?? null

  const [hist] = await sql`select imei, seen_to, model from device_plate_history
                           where plate_norm = ${p} and seen_to is not null and imei is distinct from ${currentImei}
                           order by seen_to desc limit 1`
  let previous: PlateImeis['previous'] = hist ? { imei: hist.imei, source: 'intranet', date: new Date(hist.seen_to).toISOString().slice(0, 10), model: hist.model } : null

  if (!previous) {
    const [reg] = await sql`select imei, intervention_date from interventions
                            where gestao_interv.plate_norm(license_plate) = ${p} and imei ~ '^[0-9]{15}$'
                              and imei is distinct from ${currentImei}
                            order by intervention_date desc, created_at desc limit 1`
    if (reg) {
      const [dev] = await sql`select model from devices where imei = ${reg.imei}`
      previous = { imei: reg.imei, source: 'registo', date: reg.intervention_date, model: dev?.model ?? null }
    }
  }
  return { current: cur ? { imei: cur.imei, model: cur.model, client_name: cur.client_name } : null, previous }
}

export type HardwareRow = { hardware: string; devices: number; equipment_id: string | null }

/** Hardware distinto que veio da Intranet, com nº de equipamentos e a correspondência manual (se houver) */
export async function getHardwareList(): Promise<HardwareRow[]> {
  await requireAdmin()
  return sql<HardwareRow[]>`
    select d.model as hardware, count(*)::int as devices, m.equipment_id
    from devices d left join hardware_map m on m.hardware = d.model
    where d.active and d.model is not null
    group by d.model, m.equipment_id order by count(*) desc, d.model`
}

/** Define (ou retira, com null) a correspondência manual de um hardware */
export async function setHardwareMapping(hardware: string, equipmentId: string | null) {
  try {
    const user = await requireAdmin()
    if (!hardware.trim()) throw new Error('Hardware inválido.')
    if (equipmentId && !/^[0-9a-f-]{36}$/i.test(equipmentId)) throw new Error('Equipamento inválido.')
    if (equipmentId)
      await sql`insert into hardware_map (hardware, equipment_id, updated_by) values (${hardware}, ${equipmentId}, ${user.email})
                on conflict (hardware) do update set equipment_id = excluded.equipment_id, updated_at = now(), updated_by = excluded.updated_by`
    else await sql`delete from hardware_map where hardware = ${hardware}`
    revalidatePath('/settings')
    revalidatePath('/interventions/new')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}
