import { getReferenceData } from '@/services/database'
import { InterventionForm } from '@/components/interventions/InterventionForm'

export default async function NewInterventionPage() {
  const referenceData = await getReferenceData()

  return (
    <div className="container mx-auto py-10">
      <InterventionForm referenceData={referenceData} />
    </div>
  )
}
