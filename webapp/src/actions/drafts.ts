'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getCurrentUser, requireAdmin } from '@/lib/auth'
import { importCreatorForms, resolveRegisteredDrafts } from '@/lib/creator-import'

export type DraftRow = {
  id: string; form_type: string | null; intervention_date: string | null; client_name: string | null; technician_name: string | null
  license_plate: string | null; imei: string | null; ticket: string | null; created_at: string
}

/** Intervenções por confirmar (formulários do Creator ainda não revistos). Só admin / super admin; outros recebem lista vazia. */
export async function getPendingDrafts(): Promise<DraftRow[]> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') return []
  try {
    await resolveRegisteredDrafts() // os que entretanto foram registados à mão saem da lista
    return await sql<DraftRow[]>`
      select id, form_type, intervention_date::text, client_name, technician_name, license_plate, imei, ticket, created_at::text
      from intervention_drafts where status = 'pending' order by intervention_date nulls last, created_at`
  } catch { return [] } // tabela ainda não criada
}

/** Dispensa um formulário (não vai ser registado como intervenção) */
export async function dismissDraft(id: string) {
  try {
    const user = await requireAdmin()
    await sql`update intervention_drafts set status = 'dismissed', resolved_at = now(), resolved_by = ${user.email} where id = ${id} and status = 'pending'`
    revalidatePath('/interventions/drafts')
    return { ok: true as const }
  } catch (e) { return { ok: false as const, error: (e as Error).message } }
}

/** Importa agora os formulários "Por validar" do Creator (o mesmo que a tarefa diária) */
export async function importDraftsNow() {
  try {
    await requireAdmin()
    const r = await importCreatorForms()
    revalidatePath('/interventions/drafts')
    return { ok: true as const, ...r }
  } catch (e) { return { ok: false as const, error: (e as Error).message } }
}
