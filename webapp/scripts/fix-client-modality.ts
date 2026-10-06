/**
 * Corrige a modalidade (Venda/Aluguer) das intervenções de um cliente e recalcula o stock de cada uma.
 *   npx tsx scripts/fix-client-modality.ts --cliente "NÓBREGA" --para Venda            → lista, não altera
 *   npx tsx scripts/fix-client-modality.ts --cliente "NÓBREGA" --para Venda --confirm  → altera e recalcula
 *   opcional: --desde 2023-01-01 --ate 2025-12-31 (datas da intervenção)
 * Só mexe nas intervenções desse cliente com modalidade diferente da indicada. Ficam marcadas como editadas
 * (a importação da Sheet deixa de as sobrescrever).
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const argv = process.argv.slice(2)
const opt = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const CONFIRM = argv.includes('--confirm')
const CLIENTE = opt('--cliente')
const PARA = opt('--para')
const DESDE = opt('--desde'), ATE = opt('--ate')
const isDate = (d?: string) => !d || /^\d{4}-\d{2}-\d{2}$/.test(d)
if (!CLIENTE || !['Venda', 'Aluguer'].includes(PARA ?? '') || !isDate(DESDE) || !isDate(ATE)) {
  console.error('Uso: --cliente "Nome" --para Venda|Aluguer [--desde AAAA-MM-DD] [--ate AAAA-MM-DD] [--confirm]')
  process.exit(1)
}
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const clients = await sql<{ id: string; name: string; venda_aluguer: string | null }[]>`
    select id, name, venda_aluguer from clients where lower(btrim(name)) = lower(btrim(${CLIENTE!}))`
  if (!clients.length) throw new Error(`Cliente "${CLIENTE}" não encontrado (nome exato como aparece na app).`)
  console.log(`Cliente(s): ${clients.map((c) => `${c.name} [${c.venda_aluguer ?? 'sem modalidade'}]`).join(', ')}`)

  const rows = await sql<{ id: string; data: string; tipo: string | null; matricula: string | null; atual: string | null }[]>`
    select i.id, i.intervention_date::text as data, it.name as tipo, i.license_plate as matricula, i.venda_aluguer as atual
    from interventions i left join intervention_types it on it.id = i.intervention_type_id
    where i.client_id = any(${clients.map((c) => c.id)})
      and gestao_interv.modality_of(i.venda_aluguer) is distinct from ${PARA!}
      ${DESDE ? sql`and i.intervention_date >= ${DESDE}::date` : sql``}
      ${ATE ? sql`and i.intervention_date <= ${ATE}::date` : sql``}
    order by i.intervention_date`
  console.log(`\nIntervenções a passar para ${PARA}: ${rows.length}`)
  for (const r of rows.slice(0, 40)) console.log(`  ${r.data}  ${r.tipo ?? '—'}  ${r.matricula ?? '—'}  (atual: ${r.atual ?? 'vazio'})`)
  if (rows.length > 40) console.log(`  … e mais ${rows.length - 40}`)

  if (!CONFIRM || !rows.length) {
    if (!CONFIRM) console.log('\nNada foi alterado. Para alterar, corra de novo com --confirm')
    return sql.end()
  }
  await sql.begin(async (tx) => {
    for (const r of rows) {
      await tx`update interventions set venda_aluguer = ${PARA!}, updated_by = 'script:fix-client-modality', updated_at = now() where id = ${r.id}`
      await tx`select gestao_interv.sync_intervention_stock(${r.id})`
      await tx`select gestao_interv.supersede_corrections(${r.id})`
    }
  })
  console.log(`\nAlteradas ${rows.length} intervenções para ${PARA} e stock recalculado.`)
  if (clients.some((c) => (c.venda_aluguer ?? '') !== PARA))
    console.log(`Atenção: o cliente está como "${clients[0].venda_aluguer ?? 'sem modalidade'}" em Configurações › Clientes — corrija lá se também estiver errado.`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
