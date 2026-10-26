'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createRole, deleteRole, renameRole, setRolePermission, type RoleRow } from '@/actions/roles'
import { MODULES, type Level, type Module } from '@/lib/permissions'

const LEVELS: { value: Level; label: string }[] = [
  { value: 'none', label: 'Sem acesso' },
  { value: 'read', label: 'Ler' },
  { value: 'write', label: 'Ler e escrever' },
]

/** Perfis: o que cada perfil vê em cada menu (só o super admin) */
export function RoleManagement({ roles }: { roles: RoleRow[] }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const [label, setLabel] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const run = (fn: () => Promise<{ success: boolean; error?: string }>) =>
    start(async () => {
      const r = await fn()
      setErr(r.success ? null : r.error ?? 'Erro')
      router.refresh()
    })

  return (
    <div className="space-y-4">
      <div>
        <h2>Perfis</h2>
        <p className="fc-small text-fc-dark-60">
          Defina o que cada perfil vê em cada menu: <b>Sem acesso</b> (menu escondido), <b>Ler</b> (só consulta) ou <b>Ler e escrever</b>.
          O perfil Administrador tem sempre todos os acessos. Os utilizadores recebem o perfil no separador Utilizadores.
        </p>
      </div>
      <div className="flex gap-2">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome do novo perfil (ex.: Técnico)" className="max-w-xs" />
        <Button disabled={busy || !label.trim()} onClick={() => run(async () => { const r = await createRole(label); if (r.success) setLabel(''); return r })}><Plus /> Criar perfil</Button>
      </div>
      {err && <p className="bg-fc-danger/20 px-3 py-2 text-[#b31d25]">{err}</p>}
      <div className="overflow-x-auto border border-fc-dark-20">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-fc-grey-80 text-left">
              <th className="px-3 py-2">Perfil</th>
              {MODULES.map((m) => <th key={m.key} className="px-3 py-2">{m.label}</th>)}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.name} className="border-t border-fc-dark-10">
                <td className="px-3 py-2">
                  <input defaultValue={r.label} disabled={busy} className="w-40 bg-transparent font-semibold outline-none focus:border-b focus:border-fc-dark-40"
                    onBlur={(e) => e.target.value.trim() !== r.label && run(() => renameRole(r.name, e.target.value))} />
                  <div className="fc-small text-fc-dark-60">{r.users} utilizador(es){r.builtin ? ' · base' : ''}</div>
                </td>
                {MODULES.map((m) => (
                  <td key={m.key} className="px-3 py-2">
                    {r.name === 'admin' ? <span className="text-fc-dark-60">Ler e escrever</span> : (
                      <select value={r.perms[m.key as Module] ?? 'none'} disabled={busy}
                        className="border border-fc-dark-20 bg-transparent px-1 py-1"
                        onChange={(e) => run(() => setRolePermission(r.name, m.key, e.target.value as Level))}>
                        {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    )}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  {!r.builtin && (
                    <Button variant="ghost" size="icon" className="text-fc-danger hover:bg-fc-danger/10" disabled={busy}
                      onClick={() => confirm(`Apagar o perfil ${r.label}?`) && run(() => deleteRole(r.name))}><Trash2 /></Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fc-small text-fc-dark-60">Configurações com &ldquo;Ler&rdquo; mostra as tabelas mas não deixa alterar. Escrita na Intranet e gestão de utilizadores/perfis continuam reservadas a administradores e ao super admin.</p>
    </div>
  )
}
