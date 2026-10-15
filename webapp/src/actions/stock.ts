'use server'

import { revalidatePath } from 'next/cache'
import { sql } from '@/lib/db'
import { requireAdmin, requireUser } from '@/lib/auth'
import { matchEquipment } from '@/lib/hardware'
import { equipmentNamer } from '@/lib/equipment-namer'

export type WarehouseTotal = { warehouse_id: string; warehouse: string; venda: number; aluguer: number; sem: number; total: number; mobilized: boolean }
export type ModelTotal = { warehouse_id: string; equipment: string; venda: number; aluguer: number; sem: number; total: number }
export type StockItem = {
  imei: string; warehouse_id: string; warehouse: string; equipment: string | null; modality: string | null
  moved_at: string; kind: string; hardware: string | null
  /** a Intranet mostra este IMEI instalado numa viatura (matrícula) */
  installed_plate: string | null; installed_client: string | null
}
export type Movement = {
  id: string; imei: string; kind: string; moved_at: string; from_wh: string | null; to_wh: string | null
  equipment: string | null; modality: string | null; intervention_id: string | null; notes: string | null; created_by: string | null
  superseded_at: string | null
}

/** Totais por armazém e por modelo (só o que está atualmente em stock) */
export async function getStockTotals() {
  await requireUser()
  const [byWarehouse, rows] = await Promise.all([
    sql<WarehouseTotal[]>`
      select w.id as warehouse_id, w.name as warehouse, (w.type = 'mobilizado') as mobilized,
             count(*) filter (where c.modality = 'Venda')::int as venda,
             count(*) filter (where c.modality = 'Aluguer')::int as aluguer,
             count(*) filter (where c.modality is null)::int as sem,
             count(*)::int as total
      from stock_current c join warehouses w on w.id = c.warehouse_id
      group by w.id, w.name, w.type order by (w.type = 'mobilizado'), w.name`,
    sql<{ warehouse_id: string; equipment: string | null; hardware: string | null; modality: string | null }[]>`
      select c.warehouse_id, e.name as equipment, d.model as hardware, c.modality
      from stock_current c left join equipment_list e on e.id = c.equipment_id
      left join devices d on d.imei = c.imei
      where c.warehouse_id is not null`,
  ])
  // o equipamento é sempre o do hardware da Intranet para o IMEI (corrige entradas com o hardware errado); se não houver correspondência, o registado
  const eqName = await equipmentNamer()
  const acc = new Map<string, ModelTotal>()
  for (const r of rows) {
    const name = eqName(r.hardware) ?? r.equipment ?? r.hardware ?? '(sem equipamento)'
    const k = r.warehouse_id + '|' + name
    const t = acc.get(k) ?? { warehouse_id: r.warehouse_id, equipment: name, venda: 0, aluguer: 0, sem: 0, total: 0 }
    if (r.modality === 'Venda') t.venda++; else if (r.modality === 'Aluguer') t.aluguer++; else t.sem++
    t.total++; acc.set(k, t)
  }
  const byModel = [...acc.values()].sort((a, b) => b.total - a.total)
  return { byWarehouse, byModel }
}

/** IMEIs em stock (com filtros) */
export async function getStockItems(f: { warehouseId?: string; modality?: string; q?: string; installed?: boolean }) {
  await requireAdmin()
  const q = (f.q ?? '').replace(/\s/g, '')
  const text = (f.q ?? '').trim()
  const isImei = /^\d+$/.test(q)
  const eqName = await equipmentNamer()
  const items = await sql<StockItem[]>`
    select c.imei, c.warehouse_id, w.name as warehouse, e.name as equipment, c.modality, c.moved_at::text, c.kind, d.model as hardware,
           case when d.active and nullif(btrim(d.license_plate), '') is not null and not gestao_interv.is_internal_account(d.intranet_account_id) then d.license_plate end as installed_plate,
           case when d.active and nullif(btrim(d.license_plate), '') is not null and not gestao_interv.is_internal_account(d.intranet_account_id) then dc.name end as installed_client
    from stock_current c
    join warehouses w on w.id = c.warehouse_id
    left join equipment_list e on e.id = c.equipment_id
    left join devices d on d.imei = c.imei
    left join clients dc on dc.id = d.client_id
    where true
      ${f.warehouseId ? sql`and c.warehouse_id = ${f.warehouseId}` : sql``}
      ${f.modality === 'Venda' || f.modality === 'Aluguer' ? sql`and c.modality = ${f.modality}` : f.modality === 'sem' ? sql`and c.modality is null` : sql``}
      ${f.installed ? sql`and d.active and nullif(btrim(d.license_plate), '') is not null and not gestao_interv.is_internal_account(d.intranet_account_id)` : sql``}
      ${isImei ? sql`and c.imei like ${'%' + q + '%'}` : sql``}
    order by w.name, e.name nulls last, c.imei
    ${isImei || !text ? sql`limit 500` : sql``}`
  // pesquisa por equipamento: compara com o nome mostrado (o da app ou o obtido pelo hardware da Intranet) e com o hardware
  const fold = (v: string | null | undefined) => (v ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const t = fold(text)
  const mapped = items.map((it) => ({ ...it, equipment: eqName(it.hardware) ?? it.equipment }))
  if (isImei || !t) return mapped.slice(0, 500)
  // nome exato de um equipamento (ex.: vindo da tabela por armazém) → só esse; senão, contém
  const exact = mapped.filter((it) => fold(it.equipment) === t)
  return (exact.length ? exact : mapped.filter((it) => fold(it.equipment).includes(t) || fold(it.hardware).includes(t))).slice(0, 500)
}

/** Últimos movimentos (opcionalmente de um IMEI) */
export async function getMovements(imei?: string) {
  await requireAdmin()
  const v = (imei ?? '').replace(/\s/g, '')
  return sql<Movement[]>`
    select m.id, m.imei, m.kind, m.moved_at::text, wf.name as from_wh, wt.name as to_wh, e.name as equipment,
           m.modality, m.intervention_id, m.notes, m.created_by, m.superseded_at::text
    from stock_movements m
    left join warehouses wf on wf.id = m.from_warehouse_id
    left join warehouses wt on wt.id = m.to_warehouse_id
    left join equipment_list e on e.id = m.equipment_id
    ${v ? sql`where m.imei = ${v}` : sql``}
    order by m.moved_at desc, m.seq desc
    limit ${v ? 200 : 100}`
}

// 14 dígitos a começar por 1 = IMEI sem o 0 inicial (perdido no Excel) → repõe
const parseImeis = (text: string) => [...new Set(text.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => (/^1\d{13}$/.test(x) ? `0${x}` : x)))]

type Result = { ok: true; n: number; warnings: string[] } | { ok: false; error: string }

/** Receção de material (compra / fornecedor / stock inicial) */
export async function registerReception(input: {
  warehouseId: string; modality: string; equipmentId?: string; imeis: string; date: string; notes?: string
}): Promise<Result> {
  try {
    const user = await requireAdmin()
    if (!input.warehouseId) throw new Error('Escolha o armazém.')
    if (input.modality !== 'Venda' && input.modality !== 'Aluguer') throw new Error('Escolha Venda ou Aluguer.')
    const imeis = parseImeis(input.imeis)
    const bad = imeis.filter((i) => !/^\d{15}$/.test(i) || /^80{6}/.test(i))
    if (bad.length) throw new Error(`IMEI(s) inválido(s): ${bad.slice(0, 5).join(', ')}${bad.length > 5 ? '…' : ''}`)
    if (!imeis.length) throw new Error('Indique pelo menos um IMEI.')

    // equipamento: o escolhido; senão, o da correspondência do hardware da Intranet (se houver)
    const devices = await sql<{ imei: string; model: string | null }[]>`select imei, model from devices where imei = any(${imeis})`
    const already = await sql<{ imei: string; warehouse: string }[]>`
      select c.imei, w.name as warehouse from stock_current c join warehouses w on w.id = c.warehouse_id where c.imei = any(${imeis})`
    const warnings: string[] = []
    if (already.length) warnings.push(`${already.length} IMEI(s) já estavam em stock (foram movidos para este armazém): ${already.slice(0, 5).map((a) => `${a.imei} (${a.warehouse})`).join(', ')}`)
    const unknown = imeis.filter((i) => !devices.some((d) => d.imei === i))
    if (unknown.length) warnings.push(`${unknown.length} IMEI(s) não existem na Intranet: ${unknown.slice(0, 5).join(', ')}${unknown.length > 5 ? '…' : ''}`)

    const [equipment, mappings] = await Promise.all([
      sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
      sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
    ])
    const eqFor = (imei: string) =>
      input.equipmentId || matchEquipment(devices.find((d) => d.imei === imei)?.model, equipment, mappings)?.item.id || null
    const rows = imeis.map((imei) => ({
      imei, equipment_id: eqFor(imei), kind: 'rececao', from_warehouse_id: null, to_warehouse_id: input.warehouseId,
      modality: input.modality, moved_at: input.date || new Date().toISOString().slice(0, 10), notes: input.notes || null, created_by: user.email,
    }))
    await sql`insert into stock_movements ${sql(rows)}`
    revalidatePath('/stock')
    return { ok: true, n: rows.length, warnings }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Transferência entre armazéns (mantém a modalidade, ou muda-a se escolhida) */
/** Onde estão hoje os IMEIs colados (para a transferência com origem automática) */
export async function locateImeis(text: string) {
  await requireUser()
  const imeis = parseImeis(text)
  if (!imeis.length) return { origins: [] as { id: string; name: string; n: number }[], missing: [] as string[], total: 0 }
  const rows = await sql<{ imei: string; id: string | null; name: string | null }[]>`
    select c.imei, c.warehouse_id as id, w.name from stock_current c left join warehouses w on w.id = c.warehouse_id
    where c.imei = any(${imeis}) and c.warehouse_id is not null`
  const by = new Map<string, { id: string; name: string; n: number }>()
  for (const r of rows) {
    const o = by.get(r.id!) ?? { id: r.id!, name: r.name ?? '—', n: 0 }
    o.n++; by.set(r.id!, o)
  }
  const found = new Set(rows.map((r) => r.imei))
  return { origins: [...by.values()].sort((x, y) => y.n - x.n), missing: imeis.filter((i) => !found.has(i)), total: imeis.length }
}

/**
 * Transferência para UM destino. A origem pode ser:
 *  - um armazém (fromWarehouseId) → todos os IMEIs têm de lá estar;
 *  - automática (fromWarehouseIds = armazéns escolhidos) → cada IMEI sai do armazém onde está;
 *    os que estão noutros armazéns ou fora do stock são ignorados e reportados.
 */
export async function registerTransfer(input: {
  fromWarehouseId?: string; fromWarehouseIds?: string[]; toWarehouseId: string; imeis: string; date: string; modality?: string; notes?: string
}): Promise<Result> {
  try {
    const user = await requireAdmin()
    if (!input.toWarehouseId) throw new Error('Escolha o armazém de destino.')
    const auto = !input.fromWarehouseId
    const origins = auto ? (input.fromWarehouseIds ?? []) : [input.fromWarehouseId!]
    if (!origins.length) throw new Error('Escolha pelo menos um armazém de origem.')
    if (!auto && input.fromWarehouseId === input.toWarehouseId) throw new Error('O armazém de origem e o de destino são iguais.')
    const imeis = parseImeis(input.imeis)
    if (!imeis.length) throw new Error('Indique pelo menos um IMEI.')
    const current = await sql<{ imei: string; warehouse_id: string | null }[]>`
      select imei, warehouse_id from stock_current where imei = any(${imeis})`
    const whOf = new Map(current.map((c) => [c.imei, c.warehouse_id]))
    const notThere = imeis.filter((i) => !origins.includes(whOf.get(i) ?? ''))
    if (!auto && notThere.length)
      throw new Error(`${notThere.length} IMEI(s) não estão em stock no armazém de origem: ${notThere.slice(0, 8).join(', ')}${notThere.length > 8 ? '…' : ''}`)
    const already = imeis.filter((i) => whOf.get(i) === input.toWarehouseId)
    const todo = imeis.filter((i) => origins.includes(whOf.get(i) ?? '') && whOf.get(i) !== input.toWarehouseId)
    if (!todo.length) throw new Error('Nenhum IMEI a transferir (não estão nos armazéns de origem escolhidos ou já estão no destino).')
    const mod = input.modality === 'Venda' || input.modality === 'Aluguer' ? input.modality : null
    const rows = todo.map((imei) => ({
      imei, equipment_id: null, kind: 'transferencia', from_warehouse_id: whOf.get(imei)!, to_warehouse_id: input.toWarehouseId,
      modality: mod, moved_at: input.date || new Date().toISOString().slice(0, 10), notes: input.notes || null, created_by: user.email,
    }))
    await sql`insert into stock_movements ${sql(rows)}`
    revalidatePath('/stock')
    const warnings: string[] = []
    if (already.length) warnings.push(`${already.length} já estavam no destino.`)
    const skipped = notThere.filter((i) => !already.includes(i))
    if (skipped.length) warnings.push(`${skipped.length} ignorado(s) (fora dos armazéns escolhidos ou sem stock): ${skipped.slice(0, 8).join(', ')}${skipped.length > 8 ? '…' : ''}`)
    return { ok: true, n: rows.length, warnings }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Anula um movimento manual (receção/transferência). Os das intervenções mudam-se editando a intervenção. */
export async function deleteMovement(id: string) {
  try {
    await requireAdmin()
    const [m] = await sql`delete from stock_movements where id = ${id} and intervention_id is null returning id`
    if (!m) throw new Error('Só é possível anular receções e transferências (os movimentos das intervenções mudam-se editando a intervenção).')
    revalidatePath('/stock')
    return { ok: true as const }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** Nº de IMEIs em stock que a Intranet mostra instalados numa viatura, por armazém */
export async function getInstalledConflicts() {
  await requireUser()
  return sql<{ warehouse_id: string; n: number }[]>`
    select c.warehouse_id, count(*)::int as n
    from stock_current c join devices d on d.imei = c.imei
    where c.warehouse_id is not null and d.active and nullif(btrim(d.license_plate), '') is not null and not gestao_interv.is_internal_account(d.intranet_account_id)
      and c.warehouse_id is distinct from gestao_interv.mobilized_wh() -- no Mobilizado estar instalado é o normal
    group by c.warehouse_id`
}

/**
 * Dá saída (ajuste) aos IMEIs em stock que a Intranet mostra instalados numa viatura
 * (fora das contas internas Frotcom Lusitana). Sem `imeis`, aplica a todos os assinalados (do armazém, se indicado).
 */
export async function removeInstalledFromStock(input: { warehouseId?: string; imeis?: string[]; toWarehouseId?: string }) {
  try {
    const user = await requireAdmin()
    const imeis = (input.imeis ?? []).filter((i) => /^\d{15}$/.test(i))
    const rows = await sql<{ imei: string; warehouse_id: string; equipment_id: string | null; modality: string | null; plate: string; client: string | null }[]>`
      select c.imei, c.warehouse_id, c.equipment_id, c.modality, d.license_plate as plate, coalesce(dc.name, p.name) as client
      from stock_current c
      join devices d on d.imei = c.imei
      left join clients dc on dc.id = d.client_id
      left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
      where c.warehouse_id is not null and d.active and nullif(btrim(d.license_plate), '') is not null
        and not gestao_interv.is_internal_account(d.intranet_account_id)
        and c.warehouse_id is distinct from gestao_interv.mobilized_wh()
        ${input.warehouseId ? sql`and c.warehouse_id = ${input.warehouseId}` : sql``}
        ${imeis.length ? sql`and c.imei = any(${imeis})` : sql``}`
    if (!rows.length) throw new Error('Não há IMEIs assinalados para dar saída.')
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
    const to = input.toWarehouseId && /^[0-9a-f-]{36}$/i.test(input.toWarehouseId) ? input.toWarehouseId : null
    const [mob] = await sql<{ id: string }[]>`select gestao_interv.mobilized_wh() as id`
    const list = rows.filter((r) => r.warehouse_id !== to && !(to === null && r.warehouse_id === mob?.id))
    if (!list.length) throw new Error('Os IMEIs já estão nesse armazém.')
    await sql`insert into stock_movements ${sql(list.map((r) => ({
      imei: r.imei, equipment_id: r.equipment_id, kind: to ? 'transferencia' : 'ajuste', is_correction: true, from_warehouse_id: r.warehouse_id,
      // instalado: Aluguer fica no armazém Mobilizado (continua a ser da Frotcom); Venda sai do stock
      to_warehouse_id: to ?? (r.modality === 'Aluguer' ? mob?.id ?? null : null),
      modality: r.modality, moved_at: today, created_by: user.email,
      notes: `${to ? 'Transferido (Intranet mostra' : 'Instalado segundo a Intranet:'} ${r.plate}${r.client ? ` · ${r.client}` : ''}${to ? ')' : ''}`,
    })))}`
    revalidatePath('/stock')
    return { ok: true as const, n: list.length }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

/** IMEIs nas contas de uso interno da Intranet (demopt, testing) que na app não estão no armazém "Uso Interno" */
export async function getInternalUseMismatches() {
  await requireAdmin()
  return sql<{ imei: string; plate: string | null; account: string | null; warehouse: string | null; modality: string | null }[]>`
    select d.imei, d.license_plate as plate, coalesce(dc.intranet_short_name, dc.name, p.name) as account, w.name as warehouse, c.modality
    from devices d
    left join clients dc on dc.id = d.client_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    left join stock_current c on c.imei = d.imei
    left join warehouses w on w.id = c.warehouse_id
    where d.active and d.imei ~ '^[0-9]{15}$' and d.imei !~ '^80{6}' and gestao_interv.is_internal_use_account(d.intranet_account_id)
      and (w.id is null or w.name !~* '^uso interno')
    order by account, d.imei`
}

/** Passa para o armazém "Uso Interno" os IMEIs das contas demopt/testing (todos ou os indicados) */
export async function moveToInternalUse(imeis?: string[]) {
  try {
    const user = await requireAdmin()
    const [uso] = await sql<{ id: string }[]>`select id from warehouses where active and name ~* '^uso interno' order by name limit 1`
    if (!uso) throw new Error('Não existe um armazém "Uso Interno".')
    const all = await getInternalUseMismatches()
    const list = imeis?.length ? all.filter((r) => imeis.includes(r.imei)) : all
    if (!list.length) throw new Error('Não há IMEIs para passar para o Uso Interno.')
    const cur = await sql<{ imei: string; warehouse_id: string | null; equipment_id: string | null }[]>`
      select imei, warehouse_id, equipment_id from stock_current where imei = any(${list.map((l) => l.imei)})`
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Lisbon' })
    await sql`insert into stock_movements ${sql(list.map((r) => {
      const c = cur.find((x) => x.imei === r.imei)
      return {
        imei: r.imei, equipment_id: c?.equipment_id ?? null, kind: c?.warehouse_id ? 'transferencia' : 'rececao', is_correction: true,
        from_warehouse_id: c?.warehouse_id ?? null, to_warehouse_id: uso.id, modality: r.modality, moved_at: today, created_by: user.email,
        notes: `Uso interno (Intranet: ${r.account ?? '—'}${r.plate ? ` · ${r.plate}` : ''})`,
      }
    }))}`
    revalidatePath('/stock')
    return { ok: true as const, n: list.length }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}

export type MovementBatch = {
  key: string; created_at: string; moved_at: string; kind: string; from_wh: string | null; to_wh: string | null
  created_by: string | null; notes: string | null; n: number; superseded: number; imeis: { imei: string; equipment: string | null; modality: string | null; superseded: boolean }[]
}

/** Histórico de lotes manuais (transferências, receções, ajustes): agrupados por registo (mesmo pedido, origem e destino) */
export async function getMovementBatches(f: { from?: string; to?: string; wh?: string; kind?: string; q?: string }) {
  await requireAdmin()
  const isDate = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)
  const kind = ['transferencia', 'rececao', 'ajuste'].includes(f.kind ?? '') ? f.kind! : null
  return sql<MovementBatch[]>`
    select md5(m.created_at::text || coalesce(m.from_warehouse_id::text, '') || coalesce(m.to_warehouse_id::text, '') || m.kind) as key,
           m.created_at::text, min(m.moved_at)::text as moved_at, m.kind, wf.name as from_wh, wt.name as to_wh,
           min(m.created_by) as created_by, min(m.notes) as notes, count(*)::int as n,
           count(*) filter (where m.superseded_at is not null)::int as superseded,
           json_agg(json_build_object('imei', m.imei, 'equipment', e.name, 'modality', m.modality, 'superseded', m.superseded_at is not null) order by m.imei) as imeis
    from stock_movements m
    left join warehouses wf on wf.id = m.from_warehouse_id
    left join warehouses wt on wt.id = m.to_warehouse_id
    left join equipment_list e on e.id = coalesce(m.equipment_id, (select c.equipment_id from stock_current c where c.imei = m.imei))
    where m.intervention_id is null
      ${kind ? sql`and m.kind = ${kind}` : sql``}
      ${isDate(f.from) ? sql`and m.moved_at >= ${f.from!}::date` : sql``}
      ${isDate(f.to) ? sql`and m.moved_at <= ${f.to!}::date` : sql``}
      ${f.wh && /^[0-9a-f-]{36}$/i.test(f.wh) ? sql`and (m.from_warehouse_id = ${f.wh} or m.to_warehouse_id = ${f.wh})` : sql``}
      ${f.q ? sql`and exists (select 1 from stock_movements x where x.created_at = m.created_at and x.imei like ${'%' + f.q.replace(/\s/g, '') + '%'})` : sql``}
    group by m.created_at, m.kind, m.from_warehouse_id, m.to_warehouse_id, wf.name, wt.name
    order by m.created_at desc
    limit 200`
}

/* ---------------- Acerto de stock ---------------- */

/** Contagem de um armazém: compara os IMEIs contados com o que a app tem lá */
export async function previewStockCount(input: { warehouseId: string; imeis: string }) {
  await requireAdmin()
  if (!input.warehouseId) throw new Error('Escolha o armazém.')
  const counted = parseImeis(input.imeis)
  const [inWh, elsewhere] = await Promise.all([
    sql<{ imei: string; equipment: string | null }[]>`
      select c.imei, coalesce(d.model, e.name) as equipment from stock_current c
      left join equipment_list e on e.id = c.equipment_id left join devices d on d.imei = c.imei
      where c.warehouse_id = ${input.warehouseId} order by c.imei`,
    sql<{ imei: string; warehouse: string }[]>`
      select c.imei, w.name as warehouse from stock_current c join warehouses w on w.id = c.warehouse_id
      where c.imei = any(${counted}) and c.warehouse_id <> ${input.warehouseId}`,
  ])
  const set = new Set(counted), whSet = new Set(inWh.map((r) => r.imei))
  const where = new Map(elsewhere.map((r) => [r.imei, r.warehouse]))
  return {
    ok: inWh.filter((r) => set.has(r.imei)).length,
    missing: inWh.filter((r) => !set.has(r.imei)),
    extra: counted.filter((i) => !whSet.has(i)).map((imei) => ({ imei, from: where.get(imei) ?? null })),
  }
}

/** Aplica a contagem: os que faltam saem do stock (ajuste); os que sobram entram no armazém (transferência de onde estavam, ou receção) */
export async function applyStockCount(input: { warehouseId: string; imeis: string; date: string; modality?: string; notes?: string }): Promise<Result> {
  try {
    const user = await requireAdmin()
    const p = await previewStockCount(input)
    if (!p.missing.length && !p.extra.length) throw new Error('A contagem bate certo — não há nada a acertar.')
    const date = input.date || new Date().toISOString().slice(0, 10)
    const notes = ['Acerto de stock (contagem)', input.notes].filter(Boolean).join(' · ')
    const mod = input.modality === 'Venda' || input.modality === 'Aluguer' ? input.modality : null
    const extraImeis = p.extra.map((e) => e.imei)
    const [cur, devices, equipment, mappings] = await Promise.all([
      sql<{ imei: string; warehouse_id: string; modality: string | null; equipment_id: string | null }[]>`
        select imei, warehouse_id, modality, equipment_id from stock_current where imei = any(${extraImeis}) and warehouse_id is not null`,
      sql<{ imei: string; model: string | null }[]>`select imei, model from devices where imei = any(${extraImeis})`,
      sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
      sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
    ])
    const curOf = new Map(cur.map((c) => [c.imei, c]))
    const base = { moved_at: date, notes, created_by: user.email, is_correction: true }
    const rows = [
      ...p.missing.map((m) => ({ ...base, imei: m.imei, equipment_id: null, kind: 'ajuste', from_warehouse_id: input.warehouseId, to_warehouse_id: null, modality: null })),
      ...extraImeis.map((imei) => {
        const c = curOf.get(imei)
        return c
          ? { ...base, imei, equipment_id: null, kind: 'transferencia', from_warehouse_id: c.warehouse_id, to_warehouse_id: input.warehouseId, modality: mod }
          : { ...base, imei, kind: 'rececao', from_warehouse_id: null, to_warehouse_id: input.warehouseId, modality: mod,
              equipment_id: matchEquipment(devices.find((d) => d.imei === imei)?.model, equipment, mappings)?.item.id ?? null }
      }),
    ]
    await sql`insert into stock_movements ${sql(rows)}`
    revalidatePath('/stock')
    return { ok: true, n: rows.length, warnings: [`Saíram ${p.missing.length}, entraram ${p.extra.length}.`] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** Retira IMEIs do stock (perdido, avariado, abatido…) — movimento "Ajuste" a partir do armazém onde estão */
export async function removeImeisFromStock(input: { imeis: string; reason: string; date: string; notes?: string }): Promise<Result> {
  try {
    const user = await requireAdmin()
    if (!input.reason) throw new Error('Indique o motivo.')
    const imeis = parseImeis(input.imeis)
    if (!imeis.length) throw new Error('Indique pelo menos um IMEI.')
    const cur = await sql<{ imei: string; warehouse_id: string }[]>`
      select imei, warehouse_id from stock_current where imei = any(${imeis}) and warehouse_id is not null`
    if (!cur.length) throw new Error('Nenhum destes IMEIs está em stock.')
    const notes = [`Acerto de stock: ${input.reason}`, input.notes].filter(Boolean).join(' · ')
    const rows = cur.map((c) => ({
      imei: c.imei, equipment_id: null, kind: 'ajuste', from_warehouse_id: c.warehouse_id, to_warehouse_id: null, modality: null,
      moved_at: input.date || new Date().toISOString().slice(0, 10), notes, created_by: user.email, is_correction: true,
    }))
    await sql`insert into stock_movements ${sql(rows)}`
    revalidatePath('/stock')
    const out = imeis.filter((i) => !cur.some((c) => c.imei === i))
    return { ok: true, n: rows.length, warnings: out.length ? [`${out.length} não estavam em stock: ${out.slice(0, 8).join(', ')}${out.length > 8 ? '…' : ''}`] : [] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * Substituição em RMA: o IMEI avariado sai do stock e o IMEI de substituição entra
 * (no armazém escolhido, ou no mesmo onde estava o antigo), com a mesma modalidade.
 * Linhas "IMEI_antigo IMEI_novo" (separados por espaço, tab, ; ou ,).
 */
export async function replaceRmaImeis(input: { pairs: string; toWarehouseId?: string; date: string; notes?: string }): Promise<Result> {
  try {
    const user = await requireAdmin()
    const norm = (v: string) => (/^1\d{13}$/.test(v) ? '0' + v : v)
    const pairs = input.pairs.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\s,;]+/).filter(Boolean).map(norm))
    const bad = pairs.filter((p) => p.length !== 2 || !p.every((x) => /^\d{15}$/.test(x)) || p[0] === p[1])
    if (!pairs.length) throw new Error('Indique pelo menos uma linha "IMEI antigo  IMEI novo".')
    if (bad.length) throw new Error(`Linha(s) inválida(s): ${bad.slice(0, 3).map((p) => p.join(' ')).join(' | ')} — cada linha deve ter o IMEI antigo e o novo (15 dígitos).`)
    const olds = pairs.map((p) => p[0]), news = pairs.map((p) => p[1])
    const cur = await sql<{ imei: string; warehouse_id: string; modality: string | null }[]>`
      select imei, warehouse_id, modality from stock_current where imei = any(${[...olds, ...news]}) and warehouse_id is not null`
    const curOf = new Map(cur.map((c) => [c.imei, c]))
    const missing = olds.filter((o) => !curOf.has(o))
    if (missing.length) throw new Error(`IMEI(s) antigo(s) que não estão em stock: ${missing.slice(0, 8).join(', ')}`)
    const already = news.filter((n) => curOf.has(n))
    if (already.length) throw new Error(`IMEI(s) novo(s) que já estão em stock: ${already.slice(0, 8).join(', ')}`)
    const [devices, equipment, mappings] = await Promise.all([
      sql<{ imei: string; model: string | null }[]>`select imei, model from devices where imei = any(${news})`,
      sql<{ id: string; name: string }[]>`select id, name from equipment_list where active`,
      sql<{ hardware: string; equipment_id: string }[]>`select hardware, equipment_id from hardware_map`,
    ])
    const date = input.date || new Date().toISOString().slice(0, 10)
    const extra = input.notes ? ` · ${input.notes}` : ''
    const rows = pairs.flatMap(([o, n]) => {
      const c = curOf.get(o)!
      return [
        { imei: o, equipment_id: null, kind: 'ajuste', from_warehouse_id: c.warehouse_id, to_warehouse_id: null, modality: null,
          moved_at: date, notes: `Acerto de stock: substituído em RMA por ${n}${extra}`, created_by: user.email, is_correction: true },
        { imei: n, equipment_id: matchEquipment(devices.find((d) => d.imei === n)?.model, equipment, mappings)?.item.id ?? null,
          kind: 'rececao', from_warehouse_id: null, to_warehouse_id: input.toWarehouseId || c.warehouse_id, modality: c.modality,
          moved_at: date, notes: `Substituição RMA do ${o}${extra}`, created_by: user.email, is_correction: true },
      ]
    })
    await sql`insert into stock_movements ${sql(rows)}`
    revalidatePath('/stock')
    const unknown = news.filter((n) => !devices.some((d) => d.imei === n))
    return { ok: true, n: pairs.length, warnings: unknown.length ? [`${unknown.length} IMEI(s) novo(s) ainda não existem na Intranet (sem equipamento): ${unknown.slice(0, 5).join(', ')}`] : [] }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
