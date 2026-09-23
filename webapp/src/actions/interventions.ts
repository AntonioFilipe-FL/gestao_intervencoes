'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { interventionSchema, toDbValues } from '@/lib/schemas/intervention'

export async function createIntervention(input: unknown) {
  try {
    const user = await requireAdmin()
    const parsed = interventionSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues.map(i => i.message).join('; ') }
    }
    const values = { ...toDbValues(parsed.data), created_by: user.email }
    const [row] = await sql`insert into interventions ${sql(values)} returning id`
    revalidatePath('/interventions')
    revalidatePath('/reports')
    return { success: true as const, id: row.id as string }
  } catch (e) {
    console.error('Erro ao criar intervenção:', e)
    return { success: false as const, error: (e as Error).message }
  }
}
