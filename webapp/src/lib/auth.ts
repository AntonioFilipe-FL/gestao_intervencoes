import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { sql } from '@/lib/db'
import { getSession } from '@/lib/session'

export type CurrentUser = { email: string; name?: string; picture?: string; role: 'admin' | 'user' }

/**
 * Utilizador autenticado E autorizado (email na tabela profiles).
 * Verificado em cada pedido — remover um email em Configurações corta o acesso de imediato.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getSession()
  if (!session?.email) return null
  const [profile] = await sql<{ role: 'admin' | 'user' }[]>`
    select role from profiles where email = ${session.email.toLowerCase()}
  `
  if (!profile) return null
  return { ...session, role: profile.role }
})

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect((await getSession()) ? '/unauthorized' : '/login')
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'admin') throw new Error('Sem permissões: apenas administradores podem fazer esta operação.')
  return user
}
