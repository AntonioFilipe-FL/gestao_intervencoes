'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin, requireUser } from '@/lib/auth'
import { syncFromIntranet } from '@/lib/intranet'

/** Sincronizar clientes e IMEIs a partir da Intranet (só admins) */
export async function runIntranetSync() {
  const user = await requireAdmin()
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
