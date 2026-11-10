import { can } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { getReferenceData } from '@/services/database'
import { InterventionForm } from '@/components/interventions/InterventionForm'
import { requireUser } from '@/lib/auth'
import { billingRecipients } from '@/lib/billing-notification'
import { getClientOptions } from '@/lib/intranet'
import { sql } from '@/lib/db'

export default async function NewInterventionPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const user = await requireUser()
  if (!can(user, 'interventions', 'write')) redirect('/interventions')
  // ?draft=<id>: pré-preenche a partir de um formulário do Creator por confirmar (só admin)
  const { draft: draftId } = await searchParams
  const [draft] = draftId && /^[0-9a-f-]{36}$/i.test(draftId) && user.role === 'admin'
    ? await sql<{ id: string; form_values: Record<string, string>; notes: string[] }[]>`
        select id, form_values, notes from intervention_drafts where id = ${draftId} and status = 'pending'`
    : []
  if (draftId && !draft) redirect('/interventions/drafts')
  const [referenceData, clientOptions, [validator]] = await Promise.all([
    getReferenceData(),
    getClientOptions(draft?.form_values.client_id),
    sql<{ id: string; name: string }[]>`select id, name from technicians where lower(email) = lower(${user.email}) limit 1`,
  ])

  return (
    <div>
      <InterventionForm referenceData={referenceData} billingRecipients={billingRecipients()} clientOptions={clientOptions} validator={validator ?? null}
        prefill={draft ? { draftId: draft.id, values: draft.form_values, notes: draft.notes } : undefined} />
    </div>
  )
}
