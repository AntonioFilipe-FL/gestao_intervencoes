'use server'

import { sql } from '@/lib/db'
import { requireSuperAdmin } from '@/lib/auth'
import { updateIntranetDevices } from '@/lib/intranet'

export type PlateRow = {
  imei: string; warehouse: string | null; modality: string | null; current: string | null; account: string | null
  target: string | null; issue: string | null
}

/** Prefixo do armazém na matrícula: A1/A2 → FL; restantes → nome do armazém (RL, RN, LS, CG, TC, PG, RMA…) */
const prefixOf = (wh: string) => (/^A[12]\b/i.test(wh.trim()) ? 'FL' : wh.trim().split(/\s|-/)[0].toUpperCase())

/** Pré-visualização (não altera nada): matrícula nova XX_Ay_1234567 por IMEI */
export async function previewIntranetPlates(input: { warehouseIds: string[]; imeis: string }) {
  await requireSuperAdmin()
  const list = [...new Set(input.imeis.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{14,15}$/.test(x)).map((x) => (x.length === 14 ? '0' + x : x)))]
  if (!input.warehouseIds.length && !list.length) return [] as PlateRow[]
  const rows = await sql<{ imei: string; warehouse: string | null; modality: string | null; current: string | null; account: string | null; in_intranet: boolean }[]>`
    select coalesce(c.imei, d.imei) as imei, w.name as warehouse, c.modality, nullif(btrim(d.license_plate), '') as current,
           coalesce(dc.intranet_short_name, dc.name, p.name) as account, (d.imei is not null) as in_intranet
    from stock_current c
    join warehouses w on w.id = c.warehouse_id
    left join devices d on d.imei = c.imei
    left join clients dc on dc.intranet_account_id = d.intranet_account_id
    left join intranet_pending p on p.intranet_account_id = d.intranet_account_id
    where (${input.warehouseIds.length ? sql`c.warehouse_id = any(${input.warehouseIds})` : sql`false`}
           or ${list.length ? sql`c.imei = any(${list})` : sql`false`})
    order by w.name, c.imei`
  const seen = new Set(rows.map((r) => r.imei))
  const out: PlateRow[] = rows.map((r) => {
    let issue: string | null = null
    if (!r.in_intranet) issue = 'Não existe na Intranet'
    else if (r.modality !== 'Venda' && r.modality !== 'Aluguer') issue = 'Sem modalidade (Venda/Aluguer)'
    else if (/mobilizado/i.test(r.warehouse ?? '')) issue = 'Instalado num cliente (Mobilizado)'
    const target = issue ? null : `${prefixOf(r.warehouse!)}_A${r.modality === 'Venda' ? 1 : 2}_${r.imei.slice(-7)}`
    if (!issue && target === r.current) issue = 'Já está certo'
    return { imei: r.imei, warehouse: r.warehouse, modality: r.modality, current: r.current, account: r.account, target, issue }
  })
  // IMEIs indicados à mão aparecem primeiro
  out.sort((a, b) => Number(list.includes(b.imei)) - Number(list.includes(a.imei)))
  for (const imei of list) if (!seen.has(imei)) out.unshift({ imei, warehouse: null, modality: null, current: null, account: null, target: null, issue: 'Não está em stock na app' })
  return out
}

/** Contas Intranet conhecidas (para escolher o destino) */
export async function getIntranetAccounts() {
  await requireSuperAdmin()
  return sql<{ id: string; name: string }[]>`
    select distinct on (id) id, name from (
      select intranet_account_id as id, coalesce(intranet_short_name, name) as name from clients where intranet_account_id is not null
      union all
      select intranet_account_id, name from intranet_pending
    ) x where id is not null order by id, name`
}

/** Aplica na Intranet (SÓ super admin). Recalcula a matrícula no servidor — não confia no que vem do browser. */
export async function applyIntranetPlates(input: { imeis: string[]; accountId?: string }) {
  try {
    const user = await requireSuperAdmin()
    const preview = await previewIntranetPlates({ warehouseIds: [], imeis: input.imeis.join('\n') })
    // matrícula já certa: só se envia se for para mudar a conta
    const todo = preview.filter((r) => r.target && (!r.issue || (r.issue === 'Já está certo' && input.accountId)))
    if (!todo.length && preview.some((r) => r.issue === 'Já está certo')) throw new Error('A matrícula já está certa — escolha uma conta Intranet de destino para transferir.')
    if (!todo.length) throw new Error('Nada a atualizar.')
    const [acc] = input.accountId ? await sql<{ name: string }[]>`
      select coalesce((select coalesce(intranet_short_name, name) from clients where intranet_account_id = ${input.accountId} limit 1),
                      (select name from intranet_pending where intranet_account_id = ${input.accountId} limit 1)) as name` : [undefined]
    const res = await updateIntranetDevices(todo.map((r) => ({ imei: r.imei, plate: r.target!, accountId: input.accountId || null, accountName: acc?.name ?? null })))
    await sql`insert into intranet_write_log ${sql(res.map((r) => ({
      imei: r.imei, old_plate: r.before?.plate ?? null, new_plate: todo.find((t) => t.imei === r.imei)?.target ?? null,
      old_account: r.before?.accountId ?? null, new_account: input.accountId || null, ok: r.ok, error: r.error ?? null, created_by: user.email,
    })))}`
    return { ok: true as const, done: res.filter((r) => r.ok).length, failed: res.filter((r) => !r.ok) }
  } catch (e) {
    return { ok: false as const, error: (e as Error).message }
  }
}
