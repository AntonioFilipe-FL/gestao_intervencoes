import type { FirmwareLogRow, RefreshInfo } from '@/actions/firmware'
import { BusySubmit } from '@/components/BusyActions'

const day = (v: string) => new Date(v).toLocaleDateString('pt-PT', { timeZone: 'Europe/Lisbon' })
/** Sem comunicar há mais de 2 dias no momento do pedido */
const silent = (r: FirmwareLogRow) => !!r.last_comm && !isNaN(Date.parse(r.last_comm)) && new Date(r.created_at).getTime() - Date.parse(r.last_comm) > 2 * 86400000
/** Traduz os erros da Intranet */
function errorText(r: FirmwareLogRow) {
  const e = r.error ?? ''
  if (silent(r)) return `Não comunica desde ${day(r.last_comm!)}`
  if (/pending-firmware-upgrade/i.test(e)) return 'Já tinha um pedido pendente'
  if (/pending/i.test(e)) return 'Já tinha um pedido pendente'
  return `Erro${e ? `: ${e}` : ''}`
}

const fmt = (d: Date) => new Date(d).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' })

/** Histórico de pedidos de firmware / CAN chip (só super admin) */
export function FirmwareHistory({ rows, params, check }: { rows: FirmwareLogRow[]; params: { q?: string; kind?: string; from?: string; to?: string }; check?: RefreshInfo | null }) {
  const ok = rows.filter((r) => r.ok).length
  const upd = rows.filter((r) => r.result === 'updated').length
  const waiting = rows.filter((r) => r.queued).length
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h2>Histórico de atualizações</h2>
          <a href="/equipment-update" className="fc-small text-fc-light-100 hover:text-fc-light-60">Esconder histórico</a>
        </div>
        <p className="fc-small text-fc-dark-60">Pedidos enviados à Intranet pela app (últimos 500 que correspondem ao filtro). Visível só para o super admin. A conta é a do equipamento no momento do pedido (ou a atual, nos pedidos antigos).</p>
      </div>
      {check && (
        <p className={`fc-small ${check.error ? 'text-[#b31d25]' : 'text-fc-dark-60'}`}>
          Verificação na Intranet: {check.checked} pedido(s) por confirmar lido(s) · {check.updated} passaram a Atualizado · {check.failed} falharam
          {check.unread ? ` · ${check.unread} não lido(s)` : ''}{check.error ? ` · Erro: ${check.error}` : ''}
        </p>
      )}
      <form className="flex flex-wrap items-end gap-2 fc-small">
        <input type="hidden" name="hist" value="1" />
        <label className="flex flex-col gap-1">IMEI, conta ou utilizador
          <input name="q" defaultValue={params.q ?? ''} className="w-56 border border-fc-dark-20 bg-transparent px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">Tipo
          <select name="kind" defaultValue={params.kind ?? ''} className="border border-fc-dark-20 bg-transparent px-2 py-1">
            <option value="">Todos</option>
            <option value="device">Firmware</option>
            <option value="canadapter">CAN chip</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">De
          <input type="date" name="from" defaultValue={params.from ?? ''} className="border border-fc-dark-20 bg-transparent px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">Até
          <input type="date" name="to" defaultValue={params.to ?? ''} className="border border-fc-dark-20 bg-transparent px-2 py-1" />
        </label>
        <BusySubmit label="Filtrar" busyLabel="A filtrar…" />
        <span className="ml-auto text-fc-dark-60">{rows.length} pedido(s) · {upd} atualizado(s) · {ok - upd} enviado(s) por confirmar · {waiting} em espera · {rows.length - ok - waiting} com erro</span>
      </form>
      <div className="max-h-[600px] overflow-auto border border-fc-dark-20">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-fc-grey-80 text-left">
            <tr>
              <th className="px-3 py-2">Data</th><th className="px-3 py-2">IMEI</th><th className="px-3 py-2">Conta Intranet</th><th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Versão anterior</th><th className="px-3 py-2">Pedida</th>
              <th className="px-3 py-2">Resultado</th><th className="px-3 py-2">Pedido por</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-fc-dark-60">Sem pedidos.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-fc-dark-10">
                <td className="px-3 py-1.5 whitespace-nowrap">{fmt(r.created_at)}</td>
                <td className="px-3 py-1.5 font-mono">{r.imei}</td>
                <td className="px-3 py-1.5">{r.account ?? '—'}</td>
                <td className="px-3 py-1.5">{r.kind === 'canadapter' ? 'CAN chip' : 'Firmware'}</td>
                <td className="px-3 py-1.5">{r.previous ?? '—'}</td>
                <td className="px-3 py-1.5">{r.requested ?? '—'}</td>
                <td className="px-3 py-1.5">{r.queued
                  ? <span className="font-semibold text-[#c98a00]" title="É enviado automaticamente quando a ignição desligar (expira ao fim de 7 dias)">Em espera · ignição ligada</span>
                  : r.ok
                  ? r.result === 'updated'
                    ? <span className="font-semibold text-[#4b850d]" title={r.result_at ? `Confirmado em ${fmt(r.result_at)}` : ''}>Atualizado{r.current_version ? ` (${r.current_version})` : ''}</span>
                    : r.result === 'failed'
                      ? <span className="text-[#b31d25]">Falhou na Intranet{r.current_version ? ` · está com ${r.current_version}` : ''}</span>
                      : <span className="text-[#4b850d]">Enviado · pendente{r.current_version && <span className="text-fc-dark-60"> · está com {r.current_version}</span>}{silent(r) && <span className="text-[#c98a00]"> · não comunica desde {day(r.last_comm!)}</span>}</span>
                  : <span className="text-[#b31d25]" title={r.error ?? ''}>{errorText(r)}</span>}</td>
                <td className="px-3 py-1.5">{r.created_by ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
