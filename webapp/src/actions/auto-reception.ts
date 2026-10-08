'use server'

import { sql } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

type Batch = { id: number; at: string; n: number; byEquipment: Record<string, number> }

/** Lotes de receção automática ainda não vistos por este utilizador (para o pop-up) */
export async function getUnseenAutoReceptions() {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return null
  const [b] = await sql<{ value: string }[]>`select value from app_settings where key = 'auto_reception_batches'`
  if (!b) return null
  const batches: Batch[] = JSON.parse(b.value)
  const [seen] = await sql<{ value: string }[]>`select value from app_settings where key = ${'auto_reception_seen:' + user.email.toLowerCase()}`
  const seenId = Number(seen?.value ?? 0)
  const unseen = batches.filter((x) => x.id > seenId)
  if (!unseen.length) return null
  const byEquipment: Record<string, number> = {}
  for (const x of unseen) for (const [k, v] of Object.entries(x.byEquipment)) byEquipment[k] = (byEquipment[k] ?? 0) + v
  return { lastId: unseen[unseen.length - 1].id, n: unseen.reduce((a, x) => a + x.n, 0), byEquipment }
}

export async function markAutoReceptionsSeen(lastId: number) {
  const user = await getCurrentUser()
  if (!user) return
  await sql`insert into app_settings (key, value, updated_by) values (${'auto_reception_seen:' + user.email.toLowerCase()}, ${String(lastId)}, ${user.email})
            on conflict (key) do update set value = excluded.value, updated_at = now()`
}
