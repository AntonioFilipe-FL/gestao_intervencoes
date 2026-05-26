'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

/**
 * Obtém todos os perfis (emails autorizados e seus papéis)
 */
export async function getUserRoles() {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .schema('gestao_interv')
    .from('profiles')
    .select('*')
    .order('email')
  
  if (error) {
    console.error('Error fetching profiles:', error)
    return []
  }
  
  return data
}

/**
 * Atualiza ou adiciona um perfil (email + papel)
 */
export async function updateUserRole(email: string, role: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .schema('gestao_interv')
    .from('profiles')
    .upsert({ email: email.toLowerCase().trim(), role })
  
  if (error) {
    console.error('Error updating profile:', error)
    return { success: false, error: error.message }
  }
  
  revalidatePath('/settings')
  return { success: true }
}

/**
 * Remove um email da lista autorizada
 */
export async function deleteUserProfile(email: string) {
  const supabase = await createClient()
  const { error } = await supabase
    .schema('gestao_interv')
    .from('profiles')
    .delete()
    .eq('email', email)

  if (error) return { success: false, error: error.message }
  
  revalidatePath('/settings')
  return { success: true }
}

/**
 * Verifica se o utilizador logado é Admin
 */
export async function isAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return false
  
  const { data, error } = await supabase
    .schema('gestao_interv')
    .from('profiles')
    .select('role')
    .ilike('email', user.email || '')
    .maybeSingle()
    
  if (error || !data) return false
  
  return data.role === 'admin'
}
