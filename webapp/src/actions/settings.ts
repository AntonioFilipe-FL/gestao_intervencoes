'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

/** Tabelas editáveis em Configurações e campos extra permitidos em cada uma */
const EDITABLE: Record<string, string[]> = {
  technicians: [],
  clients: ['venda_aluguer', 'nos_vdf', 'report_projeto_contrato'],
  equipment_list: [],
  intervention_types: [],
  motives: [],
  actions_performed: [],
  warehouses: ['type'],
  bundles: [],
  accessories: [],
  billing_options: [],
  intranet_accounts: [],
  warranty_options: [],
  platforms: [],
}

type Item = { id?: string; name: string; active?: boolean; [k: string]: unknown }

export async function upsertReferenceItem(table: string, item: Item) {
  try {
    await requireAdmin()
    const extra = EDITABLE[table]
    if (!extra) throw new Error(`Tabela não permitida: ${table}`)
    const name = (item.name ?? '').toString().trim()
    if (!name) throw new Error('O nome é obrigatório')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: Record<string, any> = { name, active: item.active ?? true }
    for (const k of extra) if (k in item) values[k] = item[k] === '' ? null : item[k]
    const cols = Object.keys(values)

    const [data] = item.id
      ? await sql`update ${sql(table)} set ${sql(values, cols)} where id = ${item.id} returning *`
      : await sql`insert into ${sql(table)} ${sql(values, cols)} returning *`

    revalidatePath('/settings')
    return { success: true as const, data }
  } catch (e) {
    const msg = (e as Error).message
    return { success: false as const, error: /duplicate key/.test(msg) ? 'Já existe um item com esse nome.' : msg }
  }
}

/** Em vez de apagar (quebraria o histórico), os itens são desativados. */
export async function deleteReferenceItem(table: string, id: string) {
  try {
    await requireAdmin()
    if (!EDITABLE[table]) throw new Error(`Tabela não permitida: ${table}`)
    await sql`update ${sql(table)} set active = false where id = ${id}`
    revalidatePath('/settings')
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: (e as Error).message }
  }
}
