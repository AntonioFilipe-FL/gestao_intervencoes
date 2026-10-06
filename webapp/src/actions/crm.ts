'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { fillClientModalityFromCrm, zohoConfigured, type CrmModalityResult } from '@/lib/zoho'

/** Configurações › Clientes: preencher Venda/Aluguer vazios a partir do Regime Contratual do Zoho CRM */
export async function syncModalityFromCrm(): Promise<{ ok: true; result: CrmModalityResult } | { ok: false; error: string }> {
  try {
    await requireAdmin()
    if (!zohoConfigured()) throw new Error('Faltam as variáveis ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN.')
    const result = await fillClientModalityFromCrm()
    revalidatePath('/settings')
    return { ok: true, result }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Aplica ao cliente a modalidade indicada (ex.: a do CRM numa divergência) */
export async function setClientModality(id: string, modality: 'Venda' | 'Aluguer') {
  try {
    await requireAdmin()
    if (modality !== 'Venda' && modality !== 'Aluguer') throw new Error('Modalidade inválida.')
    await sql`update clients set venda_aluguer = ${modality} where id = ${id}`
    revalidatePath('/settings')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}
