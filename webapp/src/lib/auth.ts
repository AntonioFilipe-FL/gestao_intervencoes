import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/session'
import { ALL_WRITE, NONE, can, type Level, type Module, type Perms } from '@/lib/permissions'

export type CurrentUser = { email: string; name?: string; picture?: string; role: string; superadmin: boolean; perms: Perms }

/**
 * Utilizador autenticado E autorizado (email na tabela profiles).
 * Verificado em cada pedido — remover um email em Configurações corta o acesso de imediato.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession()
  if (!session?.email) return null
  const [profile] = await sql<{ role: CurrentUser['role']; is_superadmin: boolean | null }[]>`
    select role, is_superadmin from profiles where email = ${session.email.toLowerCase()}
  `
  if (!profile) return null
  // super admin tem sempre também os acessos de admin
  const role = profile.is_superadmin ? 'admin' : profile.role
  let perms: Perms = ALL_WRITE
  if (role !== 'admin') {
    perms = { ...NONE }
    try {
      const rows = await sql<{ module: Module; level: Level }[]>`select module, level from role_permissions where role = ${role}`
      for (const r of rows) if (r.module in perms) perms[r.module] = r.level
    } catch { /* tabela ainda não criada: sem acessos extra */ }
  }
  return { ...session, role, superadmin: !!profile.is_superadmin, perms }
})

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect((await getSession()) ? '/unauthorized' : '/login')
  return user
}

/** Permissão por menu (perfil): 'read' ou 'write' */
export async function requirePerm(module: Module, level: Level = 'write') {
  const user = await requireUser()
  if (!can(user, module, level)) throw new Error('Sem permissões para esta operação (perfil).')
  return user
}

/** Marcar faturação como processada */
export async function requireBilling() {
  return requirePerm('billing', 'write')
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'admin') throw new Error('Sem permissões: apenas administradores podem fazer esta operação.')
  return user
}

/** Super admin: definições avançadas e operações sensíveis (ex.: escrever na Intranet) */
export async function requireSuperAdmin() {
  const user = await requireUser()
  if (!user.superadmin) throw new Error('Sem permissões: apenas o super admin pode fazer esta operação.')
  return user
}
