import 'server-only'
import { sql } from '@/lib/db'
import { matchEquipment } from '@/lib/hardware'

/**
 * Armazéns-espelho (só de leitura): mostram os equipamentos de uma conta da Intranet.
 *   - "Trânsito"  ← conta "Frotcom Lusitana - Transit"    (equipamentos intermédios da logística)
 *   - "Suspensos" ← conta "Frotcom Lusitana - Suspended"  (clientes suspensos; tiram os IMEIs do Mobilizado)
 * Na app não se fazem transferências, receções nem contagens para/de estes armazéns; é a sincronização com a Intranet
 * (que já lê os equipamentos de todas as contas) que os mantém (`syncMirrorWarehouses`, a seguir à receção automática):
 *   - IMEI na conta e noutro armazém (ou fora do stock) → passa para o armazém-espelho;
 *   - IMEI no armazém-espelho que saiu da conta → volta ao armazém de onde veio
 *     (se entrou de fora do stock: Trânsito → A1; Suspensos → sai do stock, volta a estar fora).
 *   - Só contam os IMEIs com equipamento (do stock ou pela correspondência do hardware da Intranet) e nunca os começados
 *     por 6 ou 900000: os outros não entram e os que lá estiverem saem do stock (pedido do AF, 24/11/2026).
 * Movimentos com created_by 'auto:<armazém>' e is_correction (uma intervenção posterior com o IMEI passa à frente).
 */

type Mirror = {
  key: 'transito' | 'suspensos'
  label: string
  account: string
  /** ao sair da conta, sem armazém de origem: 'a1' (vai para o A1) ou 'out' (sai do stock) */
  noOrigin: 'a1' | 'out'
}
export const MIRRORS: Mirror[] = [
  { key: 'transito', label: 'Trânsito', account: 'Frotcom Lusitana - Transit', noOrigin: 'a1' },
  { key: 'suspensos', label: 'Suspensos', account: 'Frotcom Lusitana - Suspended', noOrigin: 'out' },
]

/** Nome de um armazém-espelho (só de leitura) */
export const isMirrorName = (name: string | null | undefined) => /^\s*(tr[aâ]nsito?|suspensos)\s*$/i.test(name ?? '')
/** compatibilidade */
export const isTransitName = isMirrorName

export async function mirrorWarehouseIds(): Promise<string[]> {
  const [r] = await sql<{ t: string | null; s: string | null }[]>`select gestao_interv.transit_wh() as t, gestao_interv.suspended_wh() as s`
  return [r?.t, r?.s].filter(Boolean) as string[]
}

/** Erro se algum dos armazéns indicados for um armazém-espelho (só de leitura) */
export async function assertNotTransit(...warehouseIds: (string | null | undefined)[]) {
  const ids = await mirrorWarehouseIds()
  if (warehouseIds.some((w) => w && ids.includes(w)))
    throw new Error('Os armazéns Trânsito e Suspensos são só de leitura: mostram os equipamentos das contas "Frotcom Lusitana - Transit" e "- Suspended" da Intranet e são atualizados pela sincronização.')
}

export type MirrorResult = { in: number; out: number; error?: string }

/** Atualiza todos os armazéns-espelho; um erro num não impede o outro */
export async function syncMirrorWarehouses(): Promise<Record<string, MirrorResult>> {
  const [equipment, mappings] = await Promise.all([
    sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
    sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
  ])
  const out: Record<string, MirrorResult> = {}
  for (const m of MIRRORS) {
    try { out[m.key] = await syncMirror(m, equipment, mappings) }
    catch (e) { out[m.key] = { in: 0, out: 0, error: (e as Error).message } }
  }
  return out
}

async function syncMirror(m: Mirror, equipment: { id: string; name: string }[], mappings: { hardware: string; equipment_id: string }[]): Promise<MirrorResult> {
  const [w] = m.key === 'transito'
    ? await sql<{ id: string | null }[]>`select gestao_interv.transit_wh() as id`
    : await sql<{ id: string | null }[]>`select gestao_interv.suspended_wh() as id`
  const wh = w?.id
  if (!wh) throw new Error(`Não existe o armazém "${m.label}" (aplique o db/schema.sql).`)
  // IMEI (alias d = devices) na conta deste armazém
  const inAccount = () => m.key === 'transito'
    ? sql`gestao_interv.is_transit_account(d.intranet_account_id)`
    : sql`gestao_interv.is_suspended_account(d.intranet_account_id)`
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
  const eqOf = (equipmentId: string | null, model: string | null) => equipmentId ?? matchEquipment(model, equipment, mappings)?.item.id ?? null
  const excludedPrefix = (imei: string) => /^(6|900000)/.test(imei)
  const createdBy = `auto:${m.key}`

  // 1) entram: IMEIs da conta que não estão no armazém
  const inRows = await sql<{ imei: string; model: string | null; plate: string | null; warehouse_id: string | null; equipment_id: string | null; modality: string | null }[]>`
    select d.imei, d.model, d.license_plate as plate, c.warehouse_id, c.equipment_id, c.modality
    from devices d
    left join stock_current c on c.imei = d.imei
    where d.active and d.imei ~ '^[0-9]{15}$' and d.imei !~ '^80{6}'
      and d.imei !~ '^(6|900000)'
      and ${inAccount()}
      and not exists (select 1 from ignored_imeis ig where ig.imei = d.imei)
      and c.warehouse_id is distinct from ${wh}`
  const ins = inRows
    .map((r) => ({ ...r, eq: eqOf(r.equipment_id, r.model) }))
    .filter((r) => r.eq) // sem equipamento: não entra
    .map((r) => ({
      imei: r.imei, equipment_id: r.eq as string | null,
      kind: r.warehouse_id ? 'transferencia' : 'rececao', is_correction: true,
      from_warehouse_id: r.warehouse_id, to_warehouse_id: wh as string | null,
      modality: r.modality ?? 'Venda', moved_at: today, created_by: createdBy,
      notes: `${m.label} (Intranet: conta ${m.account}${r.plate ? ` · ${r.plate}` : ''})`,
    }))

  // 2) saem: sem equipamento ou começados por 6/900000 → saem do stock;
  //    já não estão na conta → voltam ao armazém de onde vieram
  const cur = await sql<{ imei: string; equipment_id: string | null; model: string | null; in_account: boolean; back: string | null; account: string | null }[]>`
    select c.imei, c.equipment_id, d.model,
           coalesce(d.active, false) and coalesce(${inAccount()}, false) as in_account,
           e.from_warehouse_id as back,
           coalesce(dc.intranet_short_name, dc.name, p.name) as account
    from stock_current c
    left join devices d on d.imei = c.imei
    left join clients dc on dc.id = d.client_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    left join lateral (select m.imei, m.from_warehouse_id from stock_movements m
                        where m.imei = c.imei and m.to_warehouse_id = ${wh} and m.superseded_at is null
                        order by m.moved_at desc, m.seq desc limit 1) e on true
    where c.warehouse_id = ${wh}`
  const leave = cur.map((r) => ({
    ...r,
    reason: excludedPrefix(r.imei) ? `IMEI começado por ${r.imei.startsWith('6') ? '6' : '900000'}`
      : !eqOf(r.equipment_id, r.model) ? 'IMEI sem equipamento' : null,
  })).filter((r) => r.reason || !r.in_account)
  let a1: string | null = null
  if (m.noOrigin === 'a1' && leave.some((r) => !r.reason && (!r.back || r.back === wh))) {
    const [x] = await sql<{ id: string }[]>`select id from warehouses where active and name ilike 'A1 %' order by name limit 1`
    a1 = x?.id ?? null
  }
  const row = (imei: string, kind: string, to: string | null, notes: string) => ({
    imei, equipment_id: null as string | null, kind, is_correction: true,
    from_warehouse_id: wh as string | null, to_warehouse_id: to, modality: null as string | null, moved_at: today, created_by: createdBy, notes,
  })
  const outs = leave.flatMap((r) => {
    if (r.reason) return [row(r.imei, 'ajuste', null, `Saída de stock: ${r.reason} (não conta no armazém ${m.label})`)]
    const note = `Saiu da conta ${m.account} (Intranet: ${r.account ?? 'sem conta'})`
    if (r.back && r.back !== wh) return [row(r.imei, 'transferencia', r.back, note)]
    // entrou de fora do stock (ou sem histórico)
    if (m.noOrigin === 'out') return [row(r.imei, 'ajuste', null, `${note} — volta a ficar fora do stock`)]
    return a1 ? [row(r.imei, 'transferencia', a1, note)] : []
  })

  const all = [...ins, ...outs]
  for (let i = 0; i < all.length; i += 500) await sql`insert into stock_movements ${sql(all.slice(i, i + 500))}`
  return { in: ins.length, out: outs.length }
}
