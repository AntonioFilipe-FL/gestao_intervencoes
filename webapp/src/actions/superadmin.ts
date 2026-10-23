'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/auth'

/** Altera a margem (%) acima do stock mínimo para o aviso amarelo */
export async function setStockMinMargin(value: string) {
  try {
    const user = await requireSuperAdmin()
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0 || n > 500) throw new Error('Indique uma percentagem entre 0 e 500.')
    await sql`insert into app_settings (key, value, updated_by, updated_at) values ('stock_min_margin', ${String(n)}, ${user.email}, now())
              on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`
    revalidatePath('/stock'); revalidatePath('/settings')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}
