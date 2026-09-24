import { redirect } from 'next/navigation'
import { getReferenceData } from '@/services/database'
import { InterventionForm } from '@/components/interventions/InterventionForm'
import { requireUser } from '@/lib/auth'
import { billingRecipients } from '@/lib/billing-notification'
import { getClientOptions } from '@/lib/intranet'

export default async function NewInterventionPage() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/interventions')
  const [referenceData, clientOptions] = await Promise.all([getReferenceData(), getClientOptions()])

  return (
    <div>
      <InterventionForm referenceData={referenceData} billingRecipients={billingRecipients()} clientOptions={clientOptions} />
    </div>
  )
}
