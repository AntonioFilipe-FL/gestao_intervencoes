'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getCurrentUser, requireSuperAdmin } from '@/lib/auth'
import { createFromPending, setPendingStatus } from '@/lib/intranet'

/** Contas novas na Intranet (ainda sem cliente na BD) desde a última vez que o super admin viu o aviso */
export async function getNewIntranetAccounts() {
  const user = await getCurrentUser()
  if (!user?.superadmin) return null
  const key = 'new_accounts_seen:' + user.email.toLowerCase()
  const [seen] = await sql<{ value: string }[]>`select value from app_settings where key = ${key}`
  // 1.ª vez: só as dos últimos 7 dias (não mostra as centenas antigas)
  const since = seen?.value ?? new Date(Date.now() - 7 * 86400000).toISOString()
  const rows = await sql<{ id: string; name: string; full_name: string | null; first_seen_at: string }[]>`
    select intranet_account_id as id, name, full_name, first_seen_at::text from intranet_pending
    where status = 'pending' and first_seen_at > ${since}::timestamptz
    order by first_seen_at desc, name limit 100`
  return rows.length ? { now: new Date().toISOString(), rows } : null
}

export async function markNewAccountsSeen(at: string) {
  const user = await getCurrentUser()
  if (!user?.superadmin) return
  await sql`insert into app_settings (key, value, updated_by) values (${'new_accounts_seen:' + user.email.toLowerCase()}, ${at}, ${user.email})
            on conflict (key) do update set value = excluded.value, updated_at = now()`
}

/** Cria clientes na BD a partir das contas escolhidas, ou ignora-as */
export async function resolveNewAccounts(ids: string[], action: 'create' | 'ignore') {
  try {
    await requireSuperAdmin()
    if (!ids.length) throw new Error('Escolha pelo menos uma conta.')
    if (action === 'create') {
      const n = await createFromPending(ids)
      revalidatePath('/settings')
      return { ok: true as const, n, text: `${n} cliente(s) criado(s).${n < ids.length ? ` ${ids.length - n} não criado(s): já existe um cliente com o mesmo nome — associe em Configurações › Intranet.` : ''}` }
    }
    await setPendingStatus(ids, 'ignored')
    revalidatePath('/settings')
    return { ok: true as const, n: ids.length, text: `${ids.length} conta(s) ignorada(s).` }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}
