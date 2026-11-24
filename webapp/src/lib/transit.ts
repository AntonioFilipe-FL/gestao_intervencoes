import 'server-only'
import { sql } from '@/lib/db'
import { matchEquipment } from '@/lib/hardware'

/**
 * Armazém "Trânsito" — só de leitura: mostra os equipamentos que estão na conta da Intranet "Frotcom Lusitana - Transit".
 * Na app não se fazem transferências, receções nem contagens para/de este armazém; é a sincronização com a Intranet
 * (que já lê os equipamentos de todas as contas) que o mantém (`syncTransitWarehouse`, a seguir à receção automática):
 *   - IMEI na conta Transit e noutro armazém (ou fora do stock) → passa para o Trânsito;
 *   - IMEI no Trânsito que saiu da conta Transit → volta ao armazém onde estava antes (se entrou sem armazém, vai para o A1).
 *   - IMEIs começados por 6 não entram no Trânsito; os que lá estiverem saem do stock (pedido do AF, 24/11/2026).
 * Os movimentos ficam com created_by 'auto:transito' e is_correction (uma intervenção posterior com o IMEI passa à frente).
 */

export const TRANSIT_NAME_RE = /^\s*tr[aâ]nsito?\s*$/i
export const isTransitName = (name: string | null | undefined) => TRANSIT_NAME_RE.test(name ?? '')

export async function transitWarehouseId(): Promise<string | null> {
  const [w] = await sql<{ id: string | null }[]>`select gestao_interv.transit_wh() as id`
  return w?.id ?? null
}

/** Erro se algum dos armazéns indicados for o Trânsito (só de leitura) */
export async function assertNotTransit(...warehouseIds: (string | null | undefined)[]) {
  const wh = await transitWarehouseId()
  if (wh && warehouseIds.includes(wh))
    throw new Error('O armazém Trânsito é só de leitura: mostra os equipamentos da conta "Frotcom Lusitana - Transit" da Intranet e é atualizado pela sincronização.')
}

export async function syncTransitWarehouse(): Promise<{ moved: number; received: number; returned: number }> {
  const wh = await transitWarehouseId()
  if (!wh) throw new Error('Não existe o armazém "Trânsito" (aplique o db/schema.sql).')
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })

  // 1) entram: IMEIs da conta Transit que não estão no Trânsito
  const inRows = await sql<{ imei: string; model: string | null; plate: string | null; warehouse_id: string | null; equipment_id: string | null; modality: string | null }[]>`
    select d.imei, d.model, d.license_plate as plate, c.warehouse_id, c.equipment_id, c.modality
    from devices d
    left join stock_current c on c.imei = d.imei
    where d.active and d.imei ~ '^[0-9]{15}$' and d.imei !~ '^80{6}'
      and d.imei !~ '^6' -- os começados por 6 não entram no Trânsito
      and gestao_interv.is_transit_account(d.intranet_account_id)
      and not exists (select 1 from ignored_imeis ig where ig.imei = d.imei)
      and c.warehouse_id is distinct from ${wh}`
  const needEq = inRows.some((r) => !r.equipment_id)
  const [equipment, mappings] = needEq
    ? await Promise.all([
        sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
        sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
      ])
    : [[], []]
  const ins = inRows.map((r) => ({
    imei: r.imei,
    equipment_id: r.equipment_id ?? matchEquipment(r.model, equipment, mappings)?.item.id ?? null,
    kind: r.warehouse_id ? 'transferencia' : 'rececao', is_correction: true,
    from_warehouse_id: r.warehouse_id, to_warehouse_id: wh,
    modality: r.modality ?? 'Venda', moved_at: today, created_by: 'auto:transito',
    notes: `Trânsito (Intranet: conta Frotcom Lusitana - Transit${r.plate ? ` · ${r.plate}` : ''})`,
  }))

  // 2) saem: IMEIs no Trânsito que já não estão na conta Transit → armazém de onde vieram (senão A1)
  const outRows = await sql<{ imei: string; back: string | null; account: string | null }[]>`
    select c.imei,
           (select m.from_warehouse_id from stock_movements m
             where m.imei = c.imei and m.to_warehouse_id = ${wh} and m.superseded_at is null
             order by m.moved_at desc, m.seq desc limit 1) as back,
           coalesce(dc.intranet_short_name, dc.name, p.name) as account
    from stock_current c
    left join devices d on d.imei = c.imei
    left join clients dc on dc.id = d.client_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where c.warehouse_id = ${wh}
      and (c.imei ~ '^6' or not (coalesce(d.active, false) and gestao_interv.is_transit_account(d.intranet_account_id)))`
  let a1: string | null = null
  const isSix = (imei: string) => imei.startsWith('6')
  if (outRows.some((r) => !isSix(r.imei) && (!r.back || r.back === wh))) {
    const [w] = await sql<{ id: string }[]>`select id from warehouses where active and name ilike 'A1 %' order by name limit 1`
    a1 = w?.id ?? null
  }
  const outs = outRows
    .map((r) => ({ ...r, to: isSix(r.imei) ? null : r.back && r.back !== wh ? r.back : a1 }))
    .filter((r) => r.to || isSix(r.imei))
    .map((r) => isSix(r.imei)
      // começados por 6: saem do stock
      ? { imei: r.imei, equipment_id: null, kind: 'ajuste', is_correction: true,
          from_warehouse_id: wh, to_warehouse_id: null as string | null, modality: null, moved_at: today, created_by: 'auto:transito',
          notes: 'Saída de stock: IMEI começado por 6 (não conta no Trânsito)' }
      : { imei: r.imei, equipment_id: null, kind: 'transferencia', is_correction: true,
          from_warehouse_id: wh, to_warehouse_id: r.to as string | null, modality: null, moved_at: today, created_by: 'auto:transito',
          notes: `Saiu da conta Frotcom Lusitana - Transit (Intranet: ${r.account ?? 'sem conta'})` })

  const all = [...ins, ...outs]
  for (let i = 0; i < all.length; i += 500) await sql`insert into stock_movements ${sql(all.slice(i, i + 500))}`
  return { moved: ins.filter((r) => r.kind === 'transferencia').length, received: ins.filter((r) => r.kind === 'rececao').length, returned: outs.length }
}
