'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function upsertReferenceItem(table: string, item: any) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .schema('gestao_interv')
    .from(table)
    .upsert(item)
    .select()
    .single()

  if (error) {
    console.error(`Error upserting into ${table}:`, error)
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  return { success: true, data }
}

export async function deleteReferenceItem(table: string, id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .schema('gestao_interv')
    .from(table)
    .delete()
    .eq('id', id)

  if (error) {
    console.error(`Error deleting from ${table}:`, error)
    return { success: false, error: error.message }
  }

  revalidatePath('/settings')
  return { success: true }
}
