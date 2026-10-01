'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

/** Liga/desliga o envio automático dos emails à financeira */
export async function setBillingEmailEnabled(enabled: boolean) {
  try {
    const user = await requireAdmin()
    await sql`insert into app_settings (key, value, updated_by, updated_at) values ('billing_email_enabled', ${enabled ? 'on' : 'off'}, ${user.email}, now())
              on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`
    revalidatePath('/settings')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}
