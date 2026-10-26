/** Módulos (menus) com permissões configuráveis por perfil */
export const MODULES = [
  { key: 'interventions', label: 'Intervenções' },
  { key: 'stock', label: 'Stock material' },
  { key: 'accessories', label: 'Stock acessórios' },
  { key: 'equipment', label: 'Atualização equipamento' },
  { key: 'reports', label: 'Relatórios' },
  { key: 'settings', label: 'Configurações' },
  { key: 'billing', label: 'Faturação (Processado)' },
] as const
export type Module = (typeof MODULES)[number]['key']
export type Level = 'none' | 'read' | 'write'
export type Perms = Record<Module, Level>
export const RANK: Record<Level, number> = { none: 0, read: 1, write: 2 }
export const ALL_WRITE = Object.fromEntries(MODULES.map((m) => [m.key, 'write'])) as Perms
export const NONE = Object.fromEntries(MODULES.map((m) => [m.key, 'none'])) as Perms
/** Funciona no cliente e no servidor */
export function can(user: { perms: Perms } | null | undefined, module: Module, level: Level = 'read') {
  return !!user && RANK[user.perms[module] ?? 'none'] >= RANK[level]
}
