import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/session'

export type CurrentUser = { email: string; name?: string; picture?: string; role: 'admin' | 'user' | 'financeiro'; superadmin: boolean }

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
  return { ...session, role: profile.is_superadmin ? 'admin' : profile.role, superadmin: !!profile.is_superadmin }
})

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect((await getSession()) ? '/unauthorized' : '/login')
  return user
}

/** Admin ou financeiro (marcar faturação como processada) */
export async function requireBilling() {
  const user = await requireUser()
  if (user.role !== 'admin' && user.role !== 'financeiro') throw new Error('Sem permissões: apenas o financeiro ou administradores.')
  return user
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
