'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { interventionSchema, toDbValues, type AccessoryLine } from '@/lib/schemas/intervention'
import { isBillable, notifyBilling } from '@/lib/billing-notification'
import { headers } from 'next/headers'
import { resolveClientId } from '@/lib/intranet'

async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  const h = await headers()
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}`
}

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
    const client_id = await resolveClientId(parsed.data.client_id)
    const values = { ...toDbValues(parsed.data), client_id, created_by: user.email, material_migrated: true }
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

    // Faturar = Sim → email automático à financeira, a partir da conta de quem gravou
    let emailWarning: string | undefined
    if (isBillable(parsed.data.billing)) {
      const r = await notifyBilling(id, user, await appUrl())
      if (!r.ok) emailWarning = `O registo foi gravado, mas o email à financeira não foi enviado: ${r.error}`
    }

    revalidatePath('/interventions')
    revalidatePath('/reports')
    return { success: true as const, id, emailWarning }
  } catch (e) {
    console.error('Erro ao criar intervenção:', e)
    return { success: false as const, error: (e as Error).message }
  }
}

/** Edição de um registo gravado (só admin). Substitui os acessórios. */
export async function updateIntervention(id: string, input: unknown) {
  try {
    const user = await requireAdmin()
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { success: false as const, error: 'Registo inválido.' }
    const parsed = interventionSchema.safeParse(input)
    if (!parsed.success) {
      return { success: false as const, error: parsed.error.issues.map(i => i.message).join('; ') }
    }
    const client_id = await resolveClientId(parsed.data.client_id)
    const values = { ...toDbValues(parsed.data), client_id, updated_by: user.email, material_migrated: true }
    const spent = merge(parsed.data.accessories_spent)
    const returned = merge(parsed.data.accessories_returned)

    const before = await sql.begin(async tx => {
      const [prev] = await tx`select billing, billing_notified_at from interventions where id = ${id} for update`
      if (!prev) throw new Error('Registo não encontrado.')
      await tx`update interventions set ${tx(values)} where id = ${id}`
      await tx`delete from intervention_accessories where intervention_id = ${id}`
      const lines = [
        ...spent.map(l => ({ intervention_id: id, direction: 'gasto', ...l })),
        ...returned.map(l => ({ intervention_id: id, direction: 'retomado', ...l })),
      ]
      if (lines.length) await tx`insert into intervention_accessories ${tx(lines)}`
      return prev as { billing: string | null; billing_notified_at: string | null }
    })

    // só envia quando o registo PASSA a Faturar = Sim e ainda não tinha sido enviado
    // (registos antigos da folha que já eram "Sim" não geram email ao serem editados)
    let emailWarning: string | undefined
    if (isBillable(parsed.data.billing) && !isBillable(before.billing ?? undefined) && !before.billing_notified_at) {
      const r = await notifyBilling(id, user, await appUrl())
      if (!r.ok) emailWarning = `As alterações foram gravadas, mas o email à financeira não foi enviado: ${r.error}`
    }

    revalidatePath('/interventions')
    revalidatePath(`/interventions/${id}`)
    revalidatePath('/reports')
    return { success: true as const, id, emailWarning }
  } catch (e) {
    console.error('Erro ao editar intervenção:', e)
    return { success: false as const, error: (e as Error).message }
  }
}

/** Reenvia manualmente o email à financeira (ex.: após um erro) */
export async function resendBillingEmail(id: string) {
  const user = await requireAdmin()
  const r = await notifyBilling(id, user, await appUrl())
  revalidatePath(`/interventions/${id}`)
  return r
}
