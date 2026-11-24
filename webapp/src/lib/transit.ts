import 'server-only'
import { sql } from '@/lib/db'
import { transferIntranetAccount } from '@/lib/intranet'

/**
 * Armazém "Transit": equipamentos intermédios da logística. Só entram e saem por transferências feitas na app
 * (a app não vai ler a Intranet para o encher).
 * Na transferência há a opção de mudar também a conta na Intranet (só se for escolhida):
 *   para o Transit → conta "Frotcom Lusitana - Transit"; do Transit para outro armazém → conta "Frotcom Lusitana".
 */

export async function transitWarehouseId(): Promise<string | null> {
  const [w] = await sql<{ id: string | null }[]>`select gestao_interv.transit_wh() as id`
  return w?.id ?? null
}

/** Conta "Frotcom Lusitana - Transit" e conta principal "Frotcom Lusitana" (das contas já guardadas na app) */
export async function transitAccounts() {
  const [t] = await sql<{ id: string }[]>`
    select intranet_account_id as id from clients where intranet_account_id is not null and gestao_interv.is_transit_account(intranet_account_id)
    union select intranet_account_id from intranet_pending where gestao_interv.is_transit_account(intranet_account_id) limit 1`
  const [m] = await sql<{ id: string }[]>`
    select intranet_account_id as id from clients where intranet_account_id is not null and lower(btrim(coalesce(intranet_short_name, name))) = 'frotcom lusitana'
    union select intranet_account_id from intranet_pending where lower(btrim(name)) = 'frotcom lusitana' limit 1`
  return { transit: t?.id ?? null, main: m?.id ?? null }
}

/**
 * Depois de uma transferência na app em que se escolheu "mudar também a conta na Intranet":
 * os IMEIs que entraram no Transit passam para a conta Transit; os que saíram do Transit passam para a conta Frotcom Lusitana.
 * Devolve mensagens para o utilizador (nunca lança erro: o stock já ficou gravado).
 */
export async function changeTransitAccounts(moves: { imei: string; from: string | null; to: string }[], by: string): Promise<string[]> {
  try {
    const wh = await transitWarehouseId()
    if (!wh) return []
    const toTransit = moves.filter((m) => m.to === wh && m.from !== wh).map((m) => m.imei)
    const fromTransit = moves.filter((m) => m.from === wh && m.to !== wh).map((m) => m.imei)
    if (!toTransit.length && !fromTransit.length) return []
    const acc = await transitAccounts()
    const msgs: string[] = []
    const run = async (imeis: string[], dest: string | null, label: string) => {
      if (!imeis.length) return
      if (!dest) { msgs.push(`Conta "${label}" não encontrada (sincronize as contas da Intranet) — conta não alterada em ${imeis.length} IMEI(s).`); return }
      const res = await transferIntranetAccount(imeis, dest, `Transferido pela app Gestão de Intervenções (${by})`)
      const ok = res.filter((r) => r.ok).length
      const bad = res.filter((r) => !r.ok)
      if (ok) msgs.push(`Intranet: ${ok} IMEI(s) na conta "${label}".`)
      if (bad.length) msgs.push(`Intranet: conta NÃO alterada em ${bad.length} IMEI(s): ${bad.slice(0, 5).map((b) => `${b.imei} (${b.error})`).join('; ')}${bad.length > 5 ? '…' : ''}`)
    }
    await run(toTransit, acc.transit, 'Frotcom Lusitana - Transit')
    await run(fromTransit, acc.main, 'Frotcom Lusitana')
    return msgs
  } catch (e) {
    return [`Intranet: conta NÃO alterada — ${(e as Error).message}`]
  }
}
