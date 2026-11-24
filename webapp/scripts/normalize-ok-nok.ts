/**
 * Uniformiza os estados da Configuração técnica para OK / NOK:
 *   - Plataforma (lista "platforms"): "Ok" → "OK", "NotOk"/"Not ok"/"nok"… → "NOK"
 *     (as intervenções apontam para a lista, por isso mudam todas; variantes repetidas são juntadas numa só)
 *   - Configuração e DTC Ativo Real Time (texto): só os valores que são exatamente ok / not ok / notok / nok (sem outras palavras)
 *
 *   npx tsx scripts/normalize-ok-nok.ts            → mostra o que muda (não altera nada)
 *   npx tsx scripts/normalize-ok-nok.ts --confirm  → aplica
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '')
const target = (s: string | null) => { const f = fold(s ?? ''); return f === 'ok' ? 'OK' : f === 'notok' || f === 'nok' ? 'NOK' : null }
// mesma regra em SQL (para os campos de texto)
const SQL_OK = `lower(regexp_replace(coalesce(%s, ''), '[^A-Za-z]', '', 'g'))`

async function main() {
  // 1) Plataforma
  const plats = await sql<{ id: string; name: string; active: boolean; n: number }[]>`
    select p.id, p.name, p.active, (select count(*)::int from interventions i where i.platform_id = p.id) as n from platforms p order by p.name`
  console.log('Plataforma (lista):')
  const plan: { id: string; from: string; to: string; n: number; keep?: string }[] = []
  for (const t of ['OK', 'NOK']) {
    const group = plats.filter((p) => target(p.name) === t)
    if (!group.length) continue
    // fica a linha mais usada (ou a que já se chama exatamente OK/NOK); as outras são juntadas nela
    const keep = group.find((p) => p.name === t) ?? [...group].sort((a, b) => b.n - a.n)[0]
    for (const p of group) {
      if (p.id === keep.id) { if (p.name !== t) plan.push({ id: p.id, from: p.name, to: t, n: p.n }) }
      else plan.push({ id: p.id, from: p.name, to: t, n: p.n, keep: keep.id })
    }
  }
  for (const p of plats) {
    const x = plan.find((y) => y.id === p.id)
    console.log(`  ${p.name.padEnd(12)} ${String(p.n).padStart(6)} intervenções  → ${x ? (x.keep ? `juntar em ${x.to}` : `renomear para ${x.to}`) : 'fica igual'}`)
  }

  // 2) Configuração e DTC (texto)
  const fields = [['configuration', 'Configuração'], ['dtc_active_realtime', 'DTC Ativo Real Time']] as const
  const textChanges: { field: string; label: string; from: string; to: string; n: number }[] = []
  for (const [f, label] of fields) {
    const rows = await sql.unsafe(`select ${f} as v, count(*)::int as n from interventions where ${SQL_OK.replace('%s', f)} in ('ok','notok','nok') group by 1 order by 2 desc`) as unknown as { v: string; n: number }[]
    for (const r of rows) { const t = target(r.v)!; if (r.v !== t) textChanges.push({ field: f, label, from: r.v, to: t, n: r.n }) }
  }
  console.log('\nConfiguração / DTC (texto):')
  if (!textChanges.length) console.log('  nada a mudar')
  for (const c of textChanges) console.log(`  ${c.label}: "${c.from}" → ${c.to}  (${c.n} intervenções)`)

  if (!plan.length && !textChanges.length) { console.log('\nJá está tudo uniformizado (OK / NOK).'); return }
  if (!CONFIRM) { console.log('\nNada foi alterado. Para aplicar: --confirm'); return }
  await sql.begin(async (tx) => {
    for (const p of plan.filter((x) => x.keep)) {
      await tx`update interventions set platform_id = ${p.keep!} where platform_id = ${p.id}`
      await tx`update platforms set active = false, name = ${`${p.from} (juntado em ${p.to})`} where id = ${p.id}`
    }
    for (const p of plan.filter((x) => !x.keep)) await tx`update platforms set name = ${p.to}, active = true where id = ${p.id}`
    for (const c of textChanges) await tx.unsafe(`update interventions set ${c.field} = $1 where ${c.field} = $2`, [c.to, c.from])
  })
  console.log('\nAplicado. A Plataforma, a Configuração e o DTC passam a usar OK / NOK.')
}
main().then(() => sql.end(), async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
