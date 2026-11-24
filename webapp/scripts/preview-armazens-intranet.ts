/**
 * Pré-visualização dos armazéns Trânsito e Suspensos (só leitura da base de dados): o que a próxima sincronização vai fazer.
 *   npx tsx scripts/preview-armazens-intranet.ts
 * (aproximado: não aplica a correspondência do hardware da Intranet — os IMEIs sem equipamento no stock aparecem à parte)
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const sql = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

const MIRRORS = [
  { label: 'Trânsito', wh: 'transit_wh', acc: 'is_transit_account', key: 'transito' },
  { label: 'Suspensos', wh: 'suspended_wh', acc: 'is_suspended_account', key: 'suspensos' },
]

async function main() {
  const [ls] = await sql<{ value: string }[]>`select value from app_settings where key = 'intranet_last_sync'`
  const last = ls ? JSON.parse(ls.value) : null
  if (last) console.log(`Última sincronização: ${new Date(last.at).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon' })}`)
  for (const m of MIRRORS) {
    console.log(`\n=== ${m.label} ===`)
    const [fn] = await sql.unsafe(`select to_regproc('gestao_interv.${m.wh}') is not null and to_regproc('gestao_interv.${m.acc}') is not null as ok`)
    if (!fn.ok) { console.log('Falta aplicar o db/schema.sql (deploy ou npm run db:schema).'); continue }
    const r = last?.devices?.mirrors?.[m.key]
    if (r) console.log(`Na última sincronização: ${r.error ? 'ERRO ' + r.error : `entraram ${r.in}, saíram ${r.out}`}`)
    const accs = await sql.unsafe(`
      select coalesce(intranet_short_name, name) as name, intranet_account_id as id from clients where gestao_interv.${m.acc}(intranet_account_id)
      union select name, intranet_account_id from intranet_pending where gestao_interv.${m.acc}(intranet_account_id)`) as unknown as { id: string; name: string }[]
    console.log('Conta na Intranet:', accs.length ? accs.map((a) => `${a.name} (${a.id})`).join(', ') : 'NENHUMA — sincronize a Intranet')
    const rows = await sql.unsafe(`
      select coalesce(w.name, '(fora do stock)') as wh, d.imei ~ '^(6|900000)' as excl, c.equipment_id is null as no_eq, count(*)::int as n
      from devices d left join stock_current c on c.imei = d.imei left join warehouses w on w.id = c.warehouse_id
      where d.active and d.imei ~ '^[0-9]{15}$' and d.imei !~ '^80{6}' and gestao_interv.${m.acc}(d.intranet_account_id)
        and not exists (select 1 from ignored_imeis ig where ig.imei = d.imei)
      group by 1, 2, 3 order by 4 desc`) as unknown as { wh: string; excl: boolean; no_eq: boolean; n: number }[]
    console.log('IMEIs na conta, por armazém atual na app:')
    for (const x of rows) console.log(`  ${String(x.n).padStart(5)}  ${x.wh}${x.excl ? '  [começados por 6/900000: não entram]' : x.no_eq ? '  [sem equipamento no stock]' : ''}`)
    const inWh = await sql.unsafe(`
      select coalesce(d.active, false) and gestao_interv.${m.acc}(d.intranet_account_id) as in_acc, count(*)::int as n
      from stock_current c left join devices d on d.imei = c.imei
      where c.warehouse_id = gestao_interv.${m.wh}() group by 1`) as unknown as { in_acc: boolean; n: number }[]
    console.log(`No armazém agora: ${inWh.map((x) => `${x.n} ${x.in_acc ? 'na conta' : 'fora da conta (saem)'}`).join(', ') || '0'}`)
  }
  console.log('\nNada foi alterado.')
}
main().then(() => sql.end(), async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
