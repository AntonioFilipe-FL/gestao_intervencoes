'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requirePerm } from '@/lib/auth'

const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '')

export type SynonymRow = { term: string; label: string; accessory_id: string | null; accessory: string | null }

export async function getAccessorySynonyms() {
  await requirePerm('settings', 'read')
  return sql<SynonymRow[]>`
    select s.term, s.label, s.accessory_id, a.name as accessory
    from accessory_synonyms s left join accessories a on a.id = s.accessory_id order by s.label`
}

/** accessoryId vazio = material sem stock (ignorar nos formulários) */
export async function saveAccessorySynonym(label: string, accessoryId: string) {
  try {
    const user = await requirePerm('settings', 'write')
    const l = label.trim()
    const term = fold(l)
    if (term.length < 2) throw new Error('Escreva o texto tal como aparece nos formulários.')
    await sql`insert into accessory_synonyms (term, label, accessory_id, created_by) values (${term}, ${l}, ${accessoryId || null}, ${user.email})
              on conflict (term) do update set label = excluded.label, accessory_id = excluded.accessory_id, created_by = excluded.created_by`
    revalidatePath('/settings')
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: (e as Error).message } }
}

export async function deleteAccessorySynonym(term: string) {
  try {
    await requirePerm('settings', 'write')
    await sql`delete from accessory_synonyms where term = ${term}`
    revalidatePath('/settings')
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: (e as Error).message } }
}
