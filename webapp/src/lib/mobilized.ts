import type { MobilizedItem } from '@/actions/stock'

/** Chave da linha "sem cliente atribuído" na matriz do Mobilizado */
export const NO_CLIENT = '_none'
const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Filtros da página Mobilizado por cliente (e da sua exportação): cliente = parte do nome; equipamento = nome exato */
export function filterMobilized(all: MobilizedItem[], f: { client?: string | null; eq?: string | null }) {
  const c = f.client?.trim()
  return all.filter((i) => (!c || fold(i.client ?? 'sem cliente atribuido').includes(fold(c))) && (!f.eq || i.equipment === f.eq))
}
