import { notFound, redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { getReferenceData } from '@/services/database'
import { getClientOptions } from '@/lib/intranet'
import { billingRecipients } from '@/lib/billing-notification'
import { InterventionForm } from '@/components/interventions/InterventionForm'
import { interventionSchema, type InterventionFormInput } from '@/lib/schemas/intervention'

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditInterventionPage({ params }: Props) {
  const { id } = await params
  const user = await requireUser()
  if (user.role !== 'admin') redirect(`/interventions/${id}`)
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()

  const [row] = await sql`select * from interventions where id = ${id}`
  if (!row) notFound()
  const [referenceData, clientOptions, lines] = await Promise.all([
    getReferenceData(),
    getClientOptions(row.client_id),
    sql<{ accessory_id: string; quantity: number; direction: string }[]>`
      select accessory_id, quantity, direction from intervention_accessories where intervention_id = ${id}`,
  ])

  // valores atuais → campos do formulário (null → '')
  const values = Object.fromEntries(
    Object.keys(interventionSchema.shape).map((k) => [k, row[k] == null ? '' : String(row[k])])
  ) as unknown as InterventionFormInput
  values.accessories_spent = lines.filter((l) => l.direction === 'gasto').map(({ accessory_id, quantity }) => ({ accessory_id, quantity }))
  values.accessories_returned = lines.filter((l) => l.direction === 'retomado').map(({ accessory_id, quantity }) => ({ accessory_id, quantity }))

  return (
    <InterventionForm
      referenceData={referenceData}
      billingRecipients={billingRecipients()}
      clientOptions={clientOptions}
      initial={{ id, values, billingNotified: !!row.billing_notified_at }}
    />
  )
}
