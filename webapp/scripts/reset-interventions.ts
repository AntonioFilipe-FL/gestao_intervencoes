/**
 * Limpa TODAS as intervenções (e os respetivos acessórios e movimentos de stock derivados),
 * para voltar a importar os CSV do zero. Só mexe no schema gestao_interv.
 *   npx tsx scripts/reset-interventions.ts                                  → só mostra contagens
 *   npx tsx scripts/reset-interventions.ts --confirm                        → apaga intervenções
 *   npx tsx scripts/reset-interventions.ts --confirm --include-manual-stock → apaga também receções/transferências/ajustes
 * Clientes, técnicos, armazéns, equipamentos, kits e ligações à Intranet não são tocados.
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const CONFIRM = process.argv.includes('--confirm')
const MANUAL = process.argv.includes('--include-manual-stock')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const [c] = await sql`
    select
      (select count(*) from interventions)::int as total,
      (select count(*) from interventions where legacy_key is not null)::int as importadas,
      (select count(*) from interventions where legacy_key is null)::int as criadas_app,
      (select count(*) from interventions where updated_by is not null)::int as editadas_app,
      (select count(*) from intervention_accessories)::int as acessorios,
      (select count(*) from stock_movements where intervention_id is not null)::int as mov_intervencoes,
      (select count(*) from stock_movements where intervention_id is null)::int as mov_manuais`
  console.log('Intervenções na BD:        ', c.total)
  console.log('  importadas da Sheet:     ', c.importadas)
  console.log('  criadas na app:          ', c.criadas_app)
  console.log('  editadas na app:         ', c.editadas_app)
  console.log('Linhas de acessórios:      ', c.acessorios)
  console.log('Movimentos de intervenções:', c.mov_intervencoes)
  console.log('Movimentos manuais (receção/transferência/ajuste):', c.mov_manuais, MANUAL ? '→ SERÃO APAGADOS' : '→ ficam')

  if (!CONFIRM) {
    console.log('\nNada foi apagado. Para apagar, corra de novo com --confirm')
    return sql.end()
  }
  await sql.begin(async (tx) => {
    const d = await tx`delete from interventions`
    console.log(`\nApagadas ${d.count} intervenções (acessórios e movimentos associados em cascata).`)
    if (MANUAL) {
      const m = await tx`delete from stock_movements`
      console.log(`Apagados ${m.count} movimentos manuais de stock.`)
    }
  })
  console.log('Agora: npm run migrate:dry  e depois  npm run migrate')
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
