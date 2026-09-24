'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin, requireUser } from '@/lib/auth'
import { syncFromIntranet, waitForAutoSync, linkPending, createFromPending, setPendingStatus, revertAutoCreatedClients } from '@/lib/intranet'

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
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return []
  return sql<DeviceOption[]>`select imei, model, license_plate from devices
                             where client_id = ${clientId} and active order by license_plate nulls last, imei`
}

export type ImeiLookup = { found: false } | { found: true; clientId: string | null; clientName: string | null; model: string | null; license_plate: string | null; active: boolean }

/** Verifica um IMEI na lista sincronizada da Intranet */
export async function lookupImei(imei: string): Promise<ImeiLookup> {
  await requireUser()
  const v = imei.replace(/\s/g, '')
  if (!/^\d{8,20}$/.test(v)) return { found: false }
  const [d] = await sql`select d.client_id, c.name as client_name, d.model, d.license_plate, d.active
                        from devices d left join clients c on c.id = d.client_id where d.imei = ${v}`
  return d
    ? { found: true, clientId: d.client_id, clientName: d.client_name, model: d.model, license_plate: d.license_plate, active: d.active }
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
  previous: { imei: string; source: 'intranet' | 'registo'; date: string | null } | null
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

  const [hist] = await sql`select imei, seen_to from device_plate_history
                           where plate_norm = ${p} and seen_to is not null and imei is distinct from ${currentImei}
                           order by seen_to desc limit 1`
  let previous: PlateImeis['previous'] = hist ? { imei: hist.imei, source: 'intranet', date: new Date(hist.seen_to).toISOString().slice(0, 10) } : null

  if (!previous) {
    const [reg] = await sql`select imei, intervention_date from interventions
                            where gestao_interv.plate_norm(license_plate) = ${p} and imei ~ '^[0-9]{15}$'
                              and imei is distinct from ${currentImei}
                            order by intervention_date desc, created_at desc limit 1`
    if (reg) previous = { imei: reg.imei, source: 'registo', date: reg.intervention_date }
  }
  return { current: cur ? { imei: cur.imei, model: cur.model, client_name: cur.client_name } : null, previous }
}
