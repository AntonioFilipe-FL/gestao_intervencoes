'use server'

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { sql } from '@/lib/db'
import { requirePerm, requireUser } from '@/lib/auth'

export type AccStockRow = { item_id: string; item: string; warehouse_id: string | null; warehouse: string | null; quantity: number; counted_at: string | null }

/** Stock de acessórios por item e armazém (só itens ativos) */
export async function getAccessoryStock() {
  await requireUser()
  const items = await sql<{ id: string; name: string }[]>`select id, name from accessory_stock_items where active order by lower(name)`
  const rows = await sql<AccStockRow[]>`
    select s.item_id, i.name as item, s.warehouse_id, w.name as warehouse, s.quantity, s.counted_at::text
    from accessory_stock s join accessory_stock_items i on i.id = s.item_id and i.active
    left join warehouses w on w.id = s.warehouse_id`
  return { items, rows }
}

export type AccMove = { id: string | null; date: string; kind: string; warehouse: string | null; quantity: number; origin: string; intervention_id: string | null; group_id: string | null; manual: boolean }

/** Movimentos de um item (manuais + intervenções), mais recentes primeiro */
export async function getAccessoryMovements(itemId: string, warehouseId?: string) {
  await requirePerm('accessories', 'read')
  return sql<AccMove[]>`
    select * from (
      select m.id::text, m.moved_at::text as date, m.kind, w.name as warehouse, m.quantity,
             concat_ws(' · ', m.notes, m.created_by) as origin, null::uuid as intervention_id, m.group_id::text, true as manual, m.created_at
      from accessory_movements m left join warehouses w on w.id = m.warehouse_id
      where m.item_id = ${itemId} ${warehouseId ? sql`and m.warehouse_id = ${warehouseId}` : sql``}
      union all
      select null, a.moved_at::text, case when a.direction = 'gasto' then 'gasto' else 'retomado' end, w.name, a.quantity,
             concat_ws(' · ', c.name, i.license_plate) as origin, a.intervention_id, null, false, a.created_at
      from accessory_intervention_moves a left join warehouses w on w.id = a.warehouse_id
      join interventions i on i.id = a.intervention_id left join clients c on c.id = i.client_id
      where a.item_id = ${itemId} ${warehouseId ? sql`and a.warehouse_id = ${warehouseId}` : sql``}
      union all
      -- kit que acompanha uma transferência de equipamentos
      select null, k.moved_at::text, 'transferencia', w.name, k.quantity,
             concat('Kit de equipamento transferido ', case when k.quantity < 0 then 'para ' else 'de ' end, ow.name) as origin,
             k.intervention_id, null, false, k.created_at
      from accessory_kit_transfer_moves k left join warehouses w on w.id = k.warehouse_id left join warehouses ow on ow.id = k.other_wh
      where k.item_id = ${itemId} ${warehouseId ? sql`and k.warehouse_id = ${warehouseId}` : sql``}
    ) x order by date desc, created_at desc limit 300`
}

/** Receção, transferência, contagem (acerto para a quantidade real) ou ajuste */
export async function registerAccessoryMovement(input: {
  kind: 'rececao' | 'transferencia' | 'contagem' | 'ajuste'; itemId: string; warehouseId: string; toWarehouseId?: string
  quantity: number; date?: string; notes?: string
}) {
  try {
    const user = await requirePerm('accessories', 'write')
    const q = Math.trunc(Number(input.quantity))
    if (!input.itemId || !input.warehouseId) throw new Error('Escolha o acessório e o armazém.')
    if (!Number.isFinite(q) || (input.kind === 'contagem' ? q < 0 : q === 0)) throw new Error('Quantidade inválida.')
    if (input.kind !== 'ajuste' && input.kind !== 'contagem' && q < 0) throw new Error('A quantidade tem de ser positiva.')
    const date = /^\d{4}-\d{2}-\d{2}$/.test(input.date ?? '') ? input.date! : new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
    const base = { item_id: input.itemId, moved_at: date, notes: input.notes?.trim() || null, created_by: user.email }
    if (input.kind === 'transferencia') {
      if (!input.toWarehouseId || input.toWarehouseId === input.warehouseId) throw new Error('Escolha um armazém de destino diferente.')
      const g = randomUUID()
      await sql`insert into accessory_movements ${sql([
        { ...base, warehouse_id: input.warehouseId, kind: 'transferencia', quantity: -q, group_id: g },
        { ...base, warehouse_id: input.toWarehouseId, kind: 'transferencia', quantity: q, group_id: g },
      ])}`
    } else {
      await sql`insert into accessory_movements ${sql({ ...base, warehouse_id: input.warehouseId, kind: input.kind, quantity: q, group_id: null })}`
    }
    revalidatePath('/accessories')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** Anula um movimento manual (numa transferência, anula as duas linhas) */
export async function deleteAccessoryMovement(id: string) {
  try {
    await requirePerm('accessories', 'write')
    const [m] = await sql<{ group_id: string | null }[]>`select group_id from accessory_movements where id = ${id}`
    if (!m) throw new Error('Movimento não encontrado.')
    if (m.group_id) await sql`delete from accessory_movements where group_id = ${m.group_id}`
    else await sql`delete from accessory_movements where id = ${id}`
    revalidatePath('/accessories')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

// --- Configurações › Stock acessórios -------------------------------------------------

export async function getAccessoryMapping() {
  await requirePerm('accessories', 'write')
  const [items, accessories] = await Promise.all([
    sql<{ id: string; name: string; active: boolean }[]>`select id, name, active from accessory_stock_items order by lower(name)`,
    sql<{ id: string; name: string; active: boolean; item_id: string | null; uses: number }[]>`
      select a.id, a.name, a.active, m.item_id,
             (select coalesce(sum(quantity), 0)::int from intervention_accessories ia where ia.accessory_id = a.id) as uses
      from accessories a left join accessory_stock_map m on m.accessory_id = a.id order by lower(a.name)`,
  ])
  return { items, accessories }
}

export async function setAccessoryMapping(accessoryId: string, itemId: string | null) {
  try {
    await requirePerm('accessories', 'write')
    if (itemId) await sql`insert into accessory_stock_map (accessory_id, item_id) values (${accessoryId}, ${itemId})
                          on conflict (accessory_id) do update set item_id = excluded.item_id`
    else await sql`delete from accessory_stock_map where accessory_id = ${accessoryId}`
    revalidatePath('/settings'); revalidatePath('/accessories')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

export async function upsertAccessoryItem(input: { id?: string; name: string; active?: boolean }) {
  try {
    await requirePerm('accessories', 'write')
    const name = input.name.trim()
    if (!name) throw new Error('Indique o nome.')
    if (input.id) await sql`update accessory_stock_items set name = ${name}, active = ${input.active ?? true} where id = ${input.id}`
    else await sql`insert into accessory_stock_items (name) values (${name})`
    revalidatePath('/settings'); revalidatePath('/accessories')
    return { ok: true as const }
  } catch (e) {
    const msg = (e as Error).message
    return { ok: false as const, error: /unique|duplicate/i.test(msg) ? 'Já existe um item com esse nome.' : msg }
  }
}
