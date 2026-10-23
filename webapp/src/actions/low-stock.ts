'use server'

import { sql } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { equipmentNamer } from '@/lib/equipment-namer'
import { getStockMinMargin } from '@/lib/stock-settings'

export type LowStock = { warehouse_id: string; warehouse: string; equipment: string; qty: number; min: number; level: 'red' | 'yellow' }

/** Equipamentos/armazéns abaixo do stock mínimo (vermelho: ≤ mínimo; amarelo: até X% acima, definido pelo super admin) */
export async function getLowStock(): Promise<LowStock[]> {
  const mins = await sql<{ equipment: string; warehouse_id: string; warehouse: string; min_qty: number }[]>`
    select e.name as equipment, m.warehouse_id, w.name as warehouse, m.min_qty
    from stock_minimums m join equipment_list e on e.id = m.equipment_id join warehouses w on w.id = m.warehouse_id and w.active`
  if (!mins.length) return []
  const whs = [...new Set(mins.map((m) => m.warehouse_id))]
  const rows = await sql<{ warehouse_id: string; equipment: string | null; hardware: string | null }[]>`
    select c.warehouse_id, e.name as equipment, d.model as hardware
    from stock_current c left join equipment_list e on e.id = c.equipment_id left join devices d on d.imei = c.imei
    where c.warehouse_id = any(${whs})`
  const eqName = await equipmentNamer()
  const margin = (await getStockMinMargin()) / 100
  const count = new Map<string, number>()
  for (const r of rows) {
    const k = `${eqName(r.hardware) ?? r.equipment ?? ''}|${r.warehouse_id}`
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  const out: LowStock[] = []
  for (const m of mins) {
    const qty = count.get(`${m.equipment}|${m.warehouse_id}`) ?? 0
    const level = qty <= m.min_qty ? 'red' : qty <= m.min_qty * (1 + margin) ? 'yellow' : null
    if (level) out.push({ warehouse_id: m.warehouse_id, warehouse: m.warehouse, equipment: m.equipment, qty, min: m.min_qty, level })
  }
  return out.sort((a, b) => (a.level === b.level ? a.warehouse.localeCompare(b.warehouse, 'pt') || a.equipment.localeCompare(b.equipment, 'pt') : a.level === 'red' ? -1 : 1))
}

/** Para o pop-up: só admins e uma vez por dia por utilizador */
export async function getLowStockNotice() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return null
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const [seen] = await sql<{ value: string }[]>`select value from app_settings where key = ${'low_stock_seen:' + user.email.toLowerCase()}`
  if (seen?.value === today) return null
  const list = await getLowStock()
  return list.length ? { today, list } : null
}

export async function markLowStockSeen(day: string) {
  const user = await getCurrentUser()
  if (!user) return
  await sql`insert into app_settings (key, value, updated_by) values (${'low_stock_seen:' + user.email.toLowerCase()}, ${day}, ${user.email})
            on conflict (key) do update set value = excluded.value, updated_at = now()`
}
