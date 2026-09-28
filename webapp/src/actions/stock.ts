'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin, requireUser } from '@/lib/auth'
import { matchEquipment } from '@/lib/hardware'

export type WarehouseTotal = { warehouse_id: string; warehouse: string; venda: number; aluguer: number; sem: number; total: number }
export type ModelTotal = { warehouse_id: string; equipment: string; venda: number; aluguer: number; sem: number; total: number }
export type StockItem = {
  imei: string; warehouse_id: string; warehouse: string; equipment: string | null; modality: string | null
  moved_at: string; kind: string; hardware: string | null
  /** a Intranet mostra este IMEI instalado numa viatura (matrícula) */
  installed_plate: string | null; installed_client: string | null
}
export type Movement = {
  id: string; imei: string; kind: string; moved_at: string; from_wh: string | null; to_wh: string | null
  equipment: string | null; modality: string | null; intervention_id: string | null; notes: string | null; created_by: string | null
}

/** Totais por armazém e por modelo (só o que está atualmente em stock) */
export async function getStockTotals() {
  await requireUser()
  const [byWarehouse, byModel] = await Promise.all([
    sql<WarehouseTotal[]>`
      select w.id as warehouse_id, w.name as warehouse,
             count(*) filter (where c.modality = 'Venda')::int as venda,
             count(*) filter (where c.modality = 'Aluguer')::int as aluguer,
             count(*) filter (where c.modality is null)::int as sem,
             count(*)::int as total
      from stock_current c join warehouses w on w.id = c.warehouse_id
      group by w.id, w.name order by w.name`,
    sql<ModelTotal[]>`
      select c.warehouse_id, coalesce(e.name, '(sem equipamento)') as equipment,
             count(*) filter (where c.modality = 'Venda')::int as venda,
             count(*) filter (where c.modality = 'Aluguer')::int as aluguer,
             count(*) filter (where c.modality is null)::int as sem,
             count(*)::int as total
      from stock_current c left join equipment_list e on e.id = c.equipment_id
      where c.warehouse_id is not null
      group by c.warehouse_id, e.name order by count(*) desc`,
  ])
  return { byWarehouse, byModel }
}

/** IMEIs em stock (com filtros) */
export async function getStockItems(f: { warehouseId?: string; modality?: string; q?: string; installed?: boolean }) {
  await requireAdmin()
  const q = (f.q ?? '').replace(/\s/g, '')
  return sql<StockItem[]>`
    select c.imei, c.warehouse_id, w.name as warehouse, e.name as equipment, c.modality, c.moved_at::text, c.kind, d.model as hardware,
           case when d.active and nullif(btrim(d.license_plate), '') is not null then d.license_plate end as installed_plate,
           case when d.active and nullif(btrim(d.license_plate), '') is not null then dc.name end as installed_client
    from stock_current c
    join warehouses w on w.id = c.warehouse_id
    left join equipment_list e on e.id = c.equipment_id
    left join devices d on d.imei = c.imei
    left join clients dc on dc.id = d.client_id
    where true
      ${f.warehouseId ? sql`and c.warehouse_id = ${f.warehouseId}` : sql``}
      ${f.modality === 'Venda' || f.modality === 'Aluguer' ? sql`and c.modality = ${f.modality}` : f.modality === 'sem' ? sql`and c.modality is null` : sql``}
      ${f.installed ? sql`and d.active and nullif(btrim(d.license_plate), '') is not null` : sql``}
      ${q ? sql`and (c.imei like ${'%' + q + '%'} or e.name ilike ${'%' + q + '%'})` : sql``}
    order by w.name, e.name nulls last, c.imei
    limit 500`
}

/** Últimos movimentos (opcionalmente de um IMEI) */
export async function getMovements(imei?: string) {
  await requireAdmin()
  const v = (imei ?? '').replace(/\s/g, '')
  return sql<Movement[]>`
    select m.id, m.imei, m.kind, m.moved_at::text, wf.name as from_wh, wt.name as to_wh, e.name as equipment,
           m.modality, m.intervention_id, m.notes, m.created_by
    from stock_movements m
    left join warehouses wf on wf.id = m.from_warehouse_id
    left join warehouses wt on wt.id = m.to_warehouse_id
    left join equipment_list e on e.id = m.equipment_id
    ${v ? sql`where m.imei = ${v}` : sql``}
    order by m.moved_at desc, m.seq desc
    limit ${v ? 200 : 100}`
}

const parseImeis = (text: string) => [...new Set(text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))]

type Result = { ok: true; n: number; warnings: string[] } | { ok: false; error: string }

/** Receção de material (compra / fornecedor / stock inicial) */
export async function registerReception(input: {
  warehouseId: string; modality: string; equipmentId?: string; imeis: string; date: string; notes?: string
}): Promise<Result> {
  try {
    const user = await requireAdmin()
    if (!input.warehouseId) throw new Error('Escolha o armazém.')
    if (input.modality !== 'Venda' && input.modality !== 'Aluguer') throw new Error('Escolha Venda ou Aluguer.')
    const imeis = parseImeis(input.imeis)
    const bad = imeis.filter((i) => !/^\d{8,20}$/.test(i))
    if (bad.length) throw new Error(`IMEI(s) inválido(s): ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}`)
    if (!imeis.length) throw new Error('Indique pelo menos um IMEI.')

    // equipamento: o escolhido; senão, o da correspondência do hardware da Intranet (se houver)
    const devices = await sql<{ imei: string; model: string | null }[]>`select imei, model from devices where imei = any(${imeis})`
    const already = await sql<{ imei: string; warehouse: string }[]>`
      select c.imei, w.name as warehouse from stock_current c join warehouses w on w.id = c.warehouse_id where c.imei = any(${imeis})`
    const warnings: string[] = []
    if (already.length) warnings.push(`${already.length} IMEI(s) já estavam em stock (foram movidos para este armazém): ${already.slice(0, 5).map((a) => `${a.imei} (${a.warehouse})`).join(', ')}`)
    const unknown = imeis.filter((i) => !devices.some((d) => d.imei === i))
    if (unknown.length) warnings.push(`${unknown.length} IMEI(s) não existem na Intranet: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}`)

    const [equipment, mappings] = await Promise.all([
      sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
      sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
    ])
    const eqFor = (imei: string) =>
      input.equipmentId || matchEquipment(devices.find((d) => d.imei === imei)?.model, equipment, mappings)?.item.id || null
    const rows = imeis.map((imei) => ({
      imei, equipment_id: eqFor(imei), kind: 'rececao', from_warehouse_id: null, to_warehouse_id: input.warehouseId,
      modality: input.modality, moved_at: input.date || new Date().toISOString().slice(0, 10), notes: input.notes || null, created_by: user.email,
    }))
    await sql`insert into stock_movements ${sql(rows)}`
    revalidatePath('/stock')
    return { ok: true, n: rows.length, warnings }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Transferência entre armazéns (mantém a modalidade, ou muda-a se escolhida) */
export async function registerTransfer(input: {
  fromWarehouseId: string; toWarehouseId: string; imeis: string; date: string; modality?: string; notes?: string
}): Promise<Result> {
  try {
    const user = await requireAdmin()
    if (!input.fromWarehouseId || !input.toWarehouseId) throw new Error('Escolha os armazéns de origem e de destino.')
    if (input.fromWarehouseId === input.toWarehouseId) throw new Error('O armazém de origem e o de destino são iguais.')
    const imeis = parseImeis(input.imeis)
    if (!imeis.length) throw new Error('Indique pelo menos um IMEI.')
    const current = await sql<{ imei: string; warehouse_id: string | null }[]>`
      select imei, warehouse_id from stock_current where imei = any(${imeis})`
    const notThere = imeis.filter((i) => current.find((c) => c.imei === i)?.warehouse_id !== input.fromWarehouseId)
    if (notThere.length)
      throw new Error(`${notThere.length} IMEI(s) não estão em stock no armazém de origem: ${notThere.slice(0, 8).join(', ')}${notThere.length > 8 ? '…' : ''}`)
    const mod = input.modality === 'Venda' || input.modality === 'Aluguer' ? input.modality : null
    const rows = imeis.map((imei) => ({
      imei, equipment_id: null, kind: 'transferencia', from_warehouse_id: input.fromWarehouseId, to_warehouse_id: input.toWarehouseId,
      modality: mod, moved_at: input.date || new Date().toISOString().slice(0, 10), notes: input.notes || null, created_by: user.email,
    }))
    await sql`insert into stock_movements ${sql(rows)}`
    revalidatePath('/stock')
    return { ok: true, n: rows.length, warnings: [] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Anula um movimento manual (receção/transferência). Os das intervenções mudam-se editando a intervenção. */
export async function deleteMovement(id: string) {
  try {
    await requireAdmin()
    const [m] = await sql`delete from stock_movements where id = ${id} and intervention_id is null returning id`
    if (!m) throw new Error('Só é possível anular receções e transferências (os movimentos das intervenções mudam-se editando a intervenção).')
    revalidatePath('/stock')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** Nº de IMEIs em stock que a Intranet mostra instalados numa viatura, por armazém */
export async function getInstalledConflicts() {
  await requireUser()
  return sql<{ warehouse_id: string; n: number }[]>`
    select c.warehouse_id, count(*)::int as n
    from stock_current c join devices d on d.imei = c.imei
    where c.warehouse_id is not null and d.active and nullif(btrim(d.license_plate), '') is not null
    group by c.warehouse_id`
}
