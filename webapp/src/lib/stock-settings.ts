import 'server-only'
import { sql } from '@/lib/db'

/** Margem (%) acima do stock mínimo para o aviso amarelo. Definida pelo super admin; por omissão 20%. */
export async function getStockMinMargin(): Promise<number> {
  const [r] = await sql<{ value: string }[]>`select value from app_settings where key = 'stock_min_margin'`
  const n = Number(r?.value)
  return Number.isFinite(n) && n >= 0 && n <= 500 ? n : 20
}
