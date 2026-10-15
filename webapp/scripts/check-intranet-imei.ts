/**
 * Diagnóstico: porque é que um IMEI não aparece na app (só leitura).
 *   npx tsx scripts/check-intranet-imei.ts 864696061247771
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const IMEI = (process.argv[2] ?? '').trim()
if (!/^\d{14,15}$/.test(IMEI)) { console.error('Uso: npx tsx scripts/check-intranet-imei.ts <IMEI>'); process.exit(1) }
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const [last] = await sql<{ value: string; updated_by: string | null; updated_at: string | null }[]>`
    select value, updated_by, updated_at::text from app_settings where key = 'intranet_last_sync'`
  if (last) {
    const v = JSON.parse(last.value)
    console.log(`Última sincronização: ${v.at ?? last.updated_at} por ${last.updated_by ?? '—'}`)
    console.log(`  ok: ${v.ok}  erro: ${v.error ?? '—'}`)
    console.log(`  equipamentos: ${JSON.stringify(v.devices ?? {})}`)
  } else console.log('Nunca houve sincronização com a Intranet.')
  const [ar] = await sql<{ value: string }[]>`select value from app_settings where key = 'auto_reception_last_run'`
  console.log(`Última receção automática: ${ar?.value ?? 'nunca'}`)

  const [tot] = await sql<{ n: number; max_shipped: string | null; synced: string | null }[]>`
    select count(*)::int as n, max(shipped_on)::text as max_shipped, max(synced_at)::text as synced from devices`.catch(async () =>
    sql<{ n: number; max_shipped: string | null; synced: string | null }[]>`select count(*)::int as n, max(shipped_on)::text as max_shipped, null::text as synced from devices`)
  console.log(`\nDevices na BD: ${tot.n} · Shipped on mais recente: ${tot.max_shipped ?? '—'}`)

  const d = await sql`select d.*, coalesce(c.name, p.name) as conta from devices d
    left join clients c on c.id = d.client_id left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where d.imei = ${IMEI}`
  console.log(`\nIMEI ${IMEI} na tabela devices: ${d.length ? JSON.stringify(d[0]) : 'NÃO EXISTE'}`)

  const accs = await sql<{ origem: string; nome: string; id: string | null; n: number }[]>`
    select 'cliente' as origem, coalesce(c.intranet_short_name, c.name) as nome, c.intranet_account_id as id,
           (select count(*)::int from devices x where x.intranet_account_id = c.intranet_account_id) as n
    from clients c where coalesce(c.intranet_short_name, c.name) ilike '%frotcom lusitana%'
    union all
    select 'pendente', p.name, p.intranet_account_id, (select count(*)::int from devices x where x.intranet_account_id = p.intranet_account_id)
    from intranet_pending p where p.name ilike '%frotcom lusitana%'`
  console.log('\nContas "Frotcom Lusitana…" conhecidas e nº de equipamentos sincronizados:')
  for (const a of accs) console.log(`  [${a.origem}] ${a.nome} (${a.id ?? 'sem id'}): ${a.n}`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
