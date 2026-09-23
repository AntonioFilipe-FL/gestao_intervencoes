'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getCurrentUser, requireAdmin } from '@/lib/auth'

/** Lista de emails autorizados e respetivos papéis (só admins) */
export async function getUserRoles() {
  await requireAdmin()
  return sql<{ email: string; role: string }[]>`select email, role from profiles order by email`
}

/** Adiciona ou atualiza um email autorizado */
export async function updateUserRole(email: string, role: string) {
  try {
    const me = await requireAdmin()
    const e = email.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Email inválido')
    if (!['admin', 'user'].includes(role)) throw new Error('Papel inválido')
    if (e === me.email.toLowerCase() && role !== 'admin') throw new Error('Não pode retirar a si próprio o papel de admin.')
    await sql`insert into profiles (email, role) values (${e}, ${role})
              on conflict (email) do update set role = excluded.role`
    revalidatePath('/settings')
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: (e as Error).message }
  }
}

/** Remove um email da lista autorizada */
export async function deleteUserProfile(email: string) {
  try {
    const me = await requireAdmin()
    if (email.toLowerCase() === me.email.toLowerCase()) throw new Error('Não pode remover o seu próprio acesso.')
    await sql`delete from profiles where email = ${email.toLowerCase()}`
    revalidatePath('/settings')
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: (e as Error).message }
  }
}

export async function isAdmin() {
  const user = await getCurrentUser()
  return user?.role === 'admin'
}
