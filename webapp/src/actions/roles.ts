'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/auth'
import { MODULES, type Level, type Module } from '@/lib/permissions'

export type RoleRow = { name: string; label: string; builtin: boolean; users: number; perms: Partial<Record<Module, Level>> }

/** Perfis e permissões por menu (só o super admin) */
export async function getRoles(): Promise<RoleRow[]> {
  await requireSuperAdmin()
  const roles = await sql<{ name: string; label: string; builtin: boolean; users: number }[]>`
    select r.name, r.label, r.builtin, (select count(*)::int from profiles p where p.role = r.name) as users
    from roles r order by r.builtin desc, r.label`
  const perms = await sql<{ role: string; module: Module; level: Level }[]>`select role, module, level from role_permissions`
  return roles.map((r) => ({ ...r, perms: Object.fromEntries(perms.filter((p) => p.role === r.name).map((p) => [p.module, p.level])) }))
}

const ok = () => { revalidatePath('/settings'); revalidatePath('/', 'layout'); return { success: true as const } }
const fail = (e: unknown) => ({ success: false as const, error: (e as Error).message })

export async function createRole(label: string) {
  try {
    await requireSuperAdmin()
    const l = label.trim()
    if (!l) throw new Error('Indique o nome do perfil.')
    const name = l.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!name) throw new Error('Nome inválido.')
    await sql.begin(async (tx) => {
      const r = await tx`insert into roles (name, label) values (${name}, ${l}) on conflict do nothing returning name`
      if (!r.length) throw new Error('Já existe um perfil com esse nome.')
      for (const m of MODULES) await tx`insert into role_permissions (role, module, level) values (${name}, ${m.key}, 'none')`
    })
    return ok()
  } catch (e) { return fail(e) }
}

export async function renameRole(name: string, label: string) {
  try {
    await requireSuperAdmin()
    if (!label.trim()) throw new Error('Indique o nome.')
    await sql`update roles set label = ${label.trim()} where name = ${name}`
    return ok()
  } catch (e) { return fail(e) }
}

export async function setRolePermission(role: string, module: Module, level: Level) {
  try {
    await requireSuperAdmin()
    if (role === 'admin') throw new Error('O perfil Administrador tem sempre todos os acessos.')
    if (!MODULES.some((m) => m.key === module) || !['none', 'read', 'write'].includes(level)) throw new Error('Valor inválido.')
    await sql`insert into role_permissions (role, module, level) values (${role}, ${module}, ${level})
              on conflict (role, module) do update set level = excluded.level`
    return ok()
  } catch (e) { return fail(e) }
}

export async function deleteRole(name: string) {
  try {
    await requireSuperAdmin()
    const [r] = await sql<{ builtin: boolean }[]>`select builtin from roles where name = ${name}`
    if (!r) throw new Error('Perfil não encontrado.')
    if (r.builtin) throw new Error('Os perfis base não podem ser apagados.')
    const [u] = await sql<{ n: number }[]>`select count(*)::int as n from profiles where role = ${name}`
    if (u.n) throw new Error(`Há ${u.n} utilizador(es) com este perfil. Mude-os primeiro.`)
    await sql`delete from roles where name = ${name}`
    return ok()
  } catch (e) { return fail(e) }
}
