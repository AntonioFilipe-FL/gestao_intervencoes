import { redirect } from 'next/navigation'
import { getReferenceData } from '@/services/database'
import { InterventionForm } from '@/components/interventions/InterventionForm'
import { requireUser } from '@/lib/auth'
import { billingRecipients } from '@/lib/billing-notification'

export default async function NewInterventionPage() {
  const user = await requireUser()
  if (user.role !== 'admin') redirect('/interventions')
  const referenceData = await getReferenceData()

  return (
    <div>
      <InterventionForm referenceData={referenceData} billingRecipients={billingRecipients()} />
    </div>
  )
}
