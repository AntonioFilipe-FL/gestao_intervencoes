/** Diagnóstico (só leitura): o que a vista de kits nas transferências está a contar. npx tsx scripts/check-kit-transfers.ts */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })
async function main() {
  const [def] = await sql<{ d: string }[]>`select pg_get_viewdef('gestao_interv.accessory_kit_transfer_moves'::regclass) as d`
  console.log(`Vista com o filtro de 16/10/2026 (versão nova): ${/2026-10-16/.test(def.d) ? 'SIM' : 'NÃO — o db:schema não aplicou a versão nova'}`)
  const [r] = await sql<{ n: number; min: string | null; max: string | null }[]>`
    select count(*)::int as n, min(moved_at)::text as min, max(moved_at)::text as max from accessory_kit_transfer_moves`
  console.log(`Linhas de kit em transferências: ${r.n} (de ${r.min ?? '—'} a ${r.max ?? '—'})`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
