/**
 * Corrige os "Dar saída" (instalado segundo a Intranet) feitos com a modalidade errada:
 *  - conta do cliente de ALUGUER mas o IMEI saiu do stock (Venda) → passa para o Instalado Aluguer (Mobilizado), modalidade Aluguer
 *  - conta do cliente de VENDA mas o IMEI ficou no Mobilizado (Aluguer) → sai do stock, modalidade Venda
 * Só mexe quando esse movimento ainda é o último do IMEI. O movimento antigo fica anulado (substituído) e é criado o correto.
 *   npx tsx scripts/fix-installed-modality.ts            → lista, não altera
 *   npx tsx scripts/fix-installed-modality.ts --confirm  → corrige
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })

const CONFIRM = process.argv.includes('--confirm')
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })

type R = { id: string; imei: string; equipment_id: string | null; from_wh: string | null; to_wh: string | null; modality: string | null
  moved_at: string; notes: string | null; created_by: string | null; from_name: string | null; client: string | null; client_modality: string | null }

async function main() {
  const [{ mob }] = await sql<{ mob: string }[]>`select gestao_interv.mobilized_wh() as mob`
  const rows = await sql<R[]>`
    with last as (
      select distinct on (m.imei) m.*
      from stock_movements m
      where m.superseded_at is null
      order by m.imei, m.moved_at desc, m.created_at desc
    )
    select l.id, l.imei, l.equipment_id, l.from_warehouse_id as from_wh, l.to_warehouse_id as to_wh, l.modality, l.moved_at::text,
           l.notes, l.created_by, fw.name as from_name, coalesce(dc.name, p.name) as client,
           gestao_interv.modality_of(coalesce(dc.venda_aluguer,
             (select x.venda_aluguer from clients x where x.intranet_account_id = d.intranet_account_id
                and gestao_interv.modality_of(x.venda_aluguer) is not null limit 1))) as client_modality
    from last l
    join devices d on d.imei = l.imei
    left join clients dc on dc.id = d.client_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    left join warehouses fw on fw.id = l.from_warehouse_id
    where l.intervention_id is null and l.notes like 'Instalado segundo a Intranet:%'
      and not gestao_interv.is_internal_account(d.intranet_account_id)`

  const toAluguer = rows.filter((r) => r.client_modality === 'Aluguer' && r.to_wh === null)
  const toVenda = rows.filter((r) => r.client_modality === 'Venda' && r.to_wh === mob)
  console.log(`"Dar saída" analisados (último movimento do IMEI): ${rows.length}`)
  console.log(`\nConta de ALUGUER mas saiu do stock → passa para o Mobilizado: ${toAluguer.length}`)
  for (const r of toAluguer.slice(0, 40)) console.log(`  ${r.imei}  ${r.moved_at}  de ${r.from_name ?? '—'}  · ${r.client ?? '—'}`)
  console.log(`\nConta de VENDA mas ficou no Mobilizado → sai do stock: ${toVenda.length}`)
  for (const r of toVenda.slice(0, 40)) console.log(`  ${r.imei}  ${r.moved_at}  de ${r.from_name ?? '—'}  · ${r.client ?? '—'}`)

  const todo = [...toAluguer.map((r) => ({ r, mod: 'Aluguer', to: mob })), ...toVenda.map((r) => ({ r, mod: 'Venda', to: null as string | null }))]
  if (!CONFIRM) { console.log('\nNada foi alterado. Para corrigir, corra de novo com --confirm'); return sql.end() }
  if (!todo.length) { console.log('\nNada a corrigir.'); return sql.end() }
  await sql.begin(async (tx) => {
    await tx`update stock_movements set superseded_at = now() where id = any(${todo.map((t) => t.r.id)})`
    await tx`insert into stock_movements ${tx(todo.map(({ r, mod, to }) => ({
      imei: r.imei, equipment_id: r.equipment_id, kind: to ? 'transferencia' : 'ajuste', is_correction: true,
      from_warehouse_id: r.from_wh, to_warehouse_id: to, modality: mod, moved_at: r.moved_at,
      notes: `${r.notes} · modalidade da conta: ${mod}`, created_by: 'script:fix-installed-modality',
    })))}`
  })
  console.log(`\nCorrigidos ${todo.length} IMEIs (${toAluguer.length} → Mobilizado, ${toVenda.length} → fora do stock).`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
