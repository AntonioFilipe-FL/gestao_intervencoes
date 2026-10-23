'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { getCurrentUser, requireSuperAdmin } from '@/lib/auth'

/** Lista de emails autorizados e respetivos papéis (só o super admin gere permissões) */
export async function getUserRoles() {
  await requireSuperAdmin()
  return sql<{ email: string; role: string; is_superadmin: boolean }[]>`select email, role, is_superadmin from profiles order by email`
}

/** O super admin não pode ser alterado nem removido pela app (só por script) */
async function assertNotSuperAdmin(email: string) {
  const [p] = await sql<{ is_superadmin: boolean }[]>`select is_superadmin from profiles where email = ${email}`
  if (p?.is_superadmin) throw new Error('O super admin não pode ser alterado nem removido.')
}

/** Adiciona ou atualiza um email autorizado */
export async function updateUserRole(email: string, role: string) {
  try {
    const me = await requireSuperAdmin()
    const e = email.toLowerCase().trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('Email inválido')
    if (!['admin', 'user', 'financeiro'].includes(role)) throw new Error('Papel inválido')
    if (e === me.email.toLowerCase() && role !== 'admin') throw new Error('Não pode retirar a si próprio o papel de admin.')
    await assertNotSuperAdmin(e)
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
    const me = await requireSuperAdmin()
    if (email.toLowerCase() === me.email.toLowerCase()) throw new Error('Não pode remover o seu próprio acesso.')
    await assertNotSuperAdmin(email.toLowerCase())
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

/** Promove um utilizador a super admin (só o super admin). Retirar o perfil só por script, para não ficar sem super admin. */
export async function promoteSuperAdmin(email: string) {
  try {
    await requireSuperAdmin()
    const e = email.toLowerCase().trim()
    const r = await sql`update profiles set is_superadmin = true, role = 'admin' where email = ${e} returning email`
    if (!r.length) throw new Error('Utilizador não encontrado.')
    revalidatePath('/settings')
    return { success: true as const }
  } catch (e) {
    return { success: false as const, error: (e as Error).message }
  }
}
