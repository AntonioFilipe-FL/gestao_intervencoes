/**
 * Pré-visualização do armazém Trânsito (só leitura da base de dados): o que a próxima sincronização vai fazer.
 *   npx tsx scripts/preview-transito.ts
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

async function main() {
  const [fn] = await sql`select to_regproc('gestao_interv.is_transit_account') is not null and to_regproc('gestao_interv.transit_wh') is not null as ok`
  if (!fn.ok) { console.log('Falta aplicar o db/schema.sql (deploy ou npm run db:schema).'); return }
  const [wh] = await sql<{ id: string | null; name: string | null }[]>`select w.id, w.name from warehouses w where w.id = gestao_interv.transit_wh()`
  console.log('Armazém:', wh?.name ?? 'NÃO EXISTE')
  const accs = await sql<{ id: string; name: string }[]>`
    select intranet_account_id as id, coalesce(intranet_short_name, name) as name from clients where gestao_interv.is_transit_account(intranet_account_id)
    union select intranet_account_id, name from intranet_pending where gestao_interv.is_transit_account(intranet_account_id)`
  console.log('Conta Transit na Intranet:', accs.length ? accs.map((a) => `${a.name} (${a.id})`).join(', ') : 'NENHUMA — sincronize a Intranet')
  const rows = await sql<{ wh: string; n: number }[]>`
    select coalesce(w.name, '(fora do stock → receção)') as wh, count(*)::int as n
    from devices d left join stock_current c on c.imei = d.imei left join warehouses w on w.id = c.warehouse_id
    where d.active and d.imei ~ '^[0-9]{15}$' and d.imei !~ '^80{6}' and d.imei !~ '^(6|900000)' and gestao_interv.is_transit_account(d.intranet_account_id)
      and not exists (select 1 from ignored_imeis ig where ig.imei = d.imei)
    group by 1 order by 2 desc`
  console.log('\nIMEIs na conta Transit, por armazém atual na app:')
  for (const r of rows) console.log(`  ${String(r.n).padStart(5)}  ${r.wh}${r.wh === wh?.name ? '  (já está)' : '  → Trânsito'}`)
  const [{ n }] = await sql<{ n: number }[]>`
    select count(*)::int as n from stock_current c left join devices d on d.imei = c.imei
    where c.warehouse_id = gestao_interv.transit_wh() and c.imei !~ '^(6|900000)' and not (coalesce(d.active, false) and gestao_interv.is_transit_account(d.intranet_account_id))`
  console.log(`\nNo Trânsito mas já fora da conta Transit (voltam ao armazém de onde vieram): ${n}`)
  const [{ six }] = await sql<{ six: number }[]>`
    select count(*)::int as six from devices d where d.active and d.imei ~ '^(6|900000)' and gestao_interv.is_transit_account(d.intranet_account_id)`
  const [{ sixIn }] = await sql<{ sixIn: number }[]>`
    select count(*)::int as "sixIn" from stock_current c where c.warehouse_id = gestao_interv.transit_wh() and c.imei ~ '^(6|900000)'`
  console.log(`IMEIs começados por 6 ou 900000 na conta Transit (não entram): ${six}; já no Trânsito (saem do stock): ${sixIn}`)
  const [{ noEq }] = await sql<{ noEq: number }[]>`
    select count(*)::int as "noEq" from stock_current c where c.warehouse_id = gestao_interv.transit_wh() and c.equipment_id is null and c.imei !~ '^(6|900000)'`
  console.log(`No Trânsito sem equipamento no stock (saem, a não ser que o hardware da Intranet corresponda a um equipamento): ${noEq}`)
  // diagnóstico: última sincronização e o que está no Trânsito
  const [ls] = await sql<{ value: string }[]>`select value from app_settings where key = 'intranet_last_sync'`
  if (ls) {
    const v = JSON.parse(ls.value)
    console.log(`\nÚltima sincronização: ${new Date(v.at).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}` +
      ` · Trânsito: ${v.devices?.transitError ? 'ERRO ' + v.devices.transitError : `entraram ${(v.devices?.transitMoved ?? 0) + (v.devices?.transitReceived ?? 0)}, saíram ${v.devices?.transitReturned ?? 'não correu (versão antiga)'}`}`)
  }
  const inWh = await sql<{ six: boolean; account_ok: boolean; n: number }[]>`
    select c.imei ~ '^(6|900000)' as six, coalesce(d.active, false) and gestao_interv.is_transit_account(d.intranet_account_id) as account_ok, count(*)::int as n
    from stock_current c left join devices d on d.imei = c.imei
    where c.warehouse_id = gestao_interv.transit_wh() group by 1, 2 order by 1, 2`
  console.log('\nNo Trânsito agora:')
  for (const r of inWh) console.log(`  ${String(r.n).padStart(5)}  ${r.six ? 'começados por 6/900000' : 'outros'} · ${r.account_ok ? 'na conta Transit' : 'fora da conta Transit'}`)
  const sample = await sql<{ imei: string; kind: string; created_by: string | null; moved_at: string; notes: string | null }[]>`
    select c.imei, m.kind, m.created_by, m.moved_at::text, m.notes
    from stock_current c
    join lateral (select * from stock_movements m where m.imei = c.imei and m.superseded_at is null order by m.moved_at desc, m.seq desc limit 1) m on true
    where c.warehouse_id = gestao_interv.transit_wh() and c.imei ~ '^(6|900000)' order by c.imei limit 5`
  if (sample.length) {
    console.log('\nExemplos (começados por 6 ou 900000) e o último movimento:')
    for (const r of sample) console.log(`  ${r.imei}  ${r.moved_at}  ${r.kind}  ${r.created_by ?? ''}  ${r.notes ?? ''}`)
  }
  console.log('\nNada foi alterado.')
}
main().then(() => sql.end(), async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
