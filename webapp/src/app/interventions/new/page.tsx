import { redirect } from 'next/navigation'
import { getReferenceData } from '@/services/database'
import { InterventionForm } from '@/components/interventions/InterventionForm'
import { requireUser } from '@/lib/auth'
import { billingRecipients } from '@/lib/billing-notification'
import { getClientOptions } from '@/lib/intranet'
import { sql } from '@/lib/db'

export default async function NewInterventionPage() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/interventions')
  const [referenceData, clientOptions, [validator]] = await Promise.all([
    getReferenceData(),
    getClientOptions(),
    sql<{ id: string; name: string }[]>`select id, name from technicians where lower(email) = lower(${user.email}) limit 1`,
  ])

  return (
    <div>
      <InterventionForm referenceData={referenceData} billingRecipients={billingRecipients()} clientOptions={clientOptions} validator={validator ?? null} />
    </div>
  )
}
