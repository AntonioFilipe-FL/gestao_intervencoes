'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { interventionSchema, toDbValues, type AccessoryLine } from '@/lib/schemas/intervention'

/** Junta linhas repetidas do mesmo acessório somando as quantidades */
const merge = (lines: AccessoryLine[]) => {
  const m = new Map<string, number>()
  for (const l of lines) m.set(l.accessory_id, Math.min(99, (m.get(l.accessory_id) ?? 0) + l.quantity))
  return [...m.entries()].map(([accessory_id, quantity]) => ({ accessory_id, quantity }))
}

export async function createIntervention(input: unknown) {
  try {
    const user = await requireAdmin()
    const parsed = interventionSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues.map(i => i.message).join('; ') }
    }
    const values = { ...toDbValues(parsed.data), created_by: user.email, material_migrated: true }
    const spent = merge(parsed.data.accessories_spent)
    const returned = merge(parsed.data.accessories_returned)

    const id = await sql.begin(async tx => {
      const [row] = await tx`insert into interventions ${tx(values)} returning id`
      const lines = [
        ...spent.map(l => ({ intervention_id: row.id, direction: 'gasto', ...l })),
        ...returned.map(l => ({ intervention_id: row.id, direction: 'retomado', ...l })),
      ]
      if (lines.length) await tx`insert into intervention_accessories ${tx(lines)}`
      return row.id as string
    })

    revalidatePath('/interventions')
    revalidatePath('/reports')
    return { success: true as const, id }
  } catch (e) {
    console.error('Erro ao criar intervenção:', e)
    return { success: false as const, error: (e as Error).message }
  }
}
