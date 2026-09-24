'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runIntranetSync, revertAutoCreated } from '@/actions/intranet'
import type { SyncResult, PendingAccount, LinkedAccount } from '@/lib/intranet'
import { LinkedAccounts } from '@/components/settings/LinkedAccounts'
import { PendingAccounts } from '@/components/settings/PendingAccounts'

type Last = (SyncResult & { at: string; by: string | null }) | null

const fmt = (d: string) => new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' })

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[220px_1fr] border-b border-fc-dark-10 last:border-0 odd:bg-fc-grey-80">
      <span className="px-4 py-2 text-fc-dark-60">{k}</span>
      <span className="px-4 py-2">{v}</span>
    </div>
  )
}

/** Configurações → Intranet: sincronizar clientes e IMEIs a partir da Intranet Frotcom */
export function IntranetSettings({
  configured,
  last: initial,
  pending,
  candidates,
  autoCreated,
  linked,
}: {
  configured: boolean
  last: Last
  pending: PendingAccount[]
  candidates: { id: string; name: string }[]
  /** clientes criados automaticamente por versões anteriores que podem voltar a "Por associar" */
  autoCreated: number
  /** contas ligadas e os seus clientes */
  linked: LinkedAccount[]
}) {
  const [last, setLast] = useState<Last>(initial)
  const [syncing, start] = useTransition()
  const router = useRouter()

  const sync = () =>
    start(async () => {
      const r = await runIntranetSync()
      setLast({ ...r, at: new Date().toISOString(), by: null })
      router.refresh() // recarrega a lista de contas por associar
    })

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2>Sincronização com a Intranet Frotcom</h2>
        <p className="fc-small max-w-4xl text-fc-dark-60">
          Importa os clientes (contas) e os IMEIs da Intranet. As contas com o mesmo nome de um cliente da BD são ligadas
          automaticamente; as restantes ficam em &ldquo;Por associar&rdquo; para escolher o cliente correspondente ou criar um novo.
          Clientes que deixaram de existir na Intranet ficam inativos (o histórico mantém-se).
        </p>
        <p className="fc-small max-w-4xl text-fc-dark-60">
          A sincronização corre <b>automaticamente em segundo plano sempre que alguém entra</b> na aplicação
          (no máximo uma vez a cada 30 minutos). O botão abaixo serve para forçar uma sincronização imediata.
        </p>
      </div>

      {!configured && (
        <p className="bg-fc-warning/20 px-3 py-2 text-[#c7830b]">
          Faltam as variáveis <b>INTRANET_USER</b> e <b>INTRANET_PASSWORD</b> no Railway (serviço gestao_intervencoes → Variables).
        </p>
      )}

      <Button size="lg" onClick={sync} disabled={syncing || !configured}>
        <RefreshCw className={syncing ? 'animate-spin' : ''} /> {syncing ? 'A sincronizar…' : 'Sincronizar agora'}
      </Button>

      {last && (
        <div className="space-y-4">
          {last.error ? (
            <p className="bg-fc-danger/20 px-3 py-2 text-[#b31d25]">Falhou: {last.error}</p>
          ) : (
            <p className="bg-fc-success/20 px-3 py-2 text-[#4b850d]">
              Última sincronização: {fmt(last.at)}{last.by ? ` por ${last.by}` : ''}
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
          {!last.error && (
            <div className="border border-fc-dark-20">
              <div className="border-b border-fc-dark-20 px-4 py-2.5 font-bold uppercase">Clientes</div>
              <Row k="Contas na Intranet" v={last.accounts.total.toLocaleString('pt-PT')} />
              <Row k="Ligadas a clientes existentes" v={last.accounts.linked} />
              <Row k="Por associar (ver abaixo)" v={<b>{pending.filter((p) => p.status === 'pending').length}</b>} />
              <Row k="Nomes atualizados" v={last.accounts.renamed} />
              <Row k="Inativados (já não existem)" v={last.accounts.deactivated} />
            </div>
          )}

          {!last.error && (
            <div className="border border-fc-dark-20">
              <div className="border-b border-fc-dark-20 px-4 py-2.5 font-bold uppercase">IMEIs</div>
              {last.devices.error && last.devices.upserted === 0 ? (
                <div className="space-y-1 px-4 py-3 text-[#b31d25]">
                  <p>{last.devices.error}</p>
                  {last.devices.sampleKeys && (
                    <p className="fc-small text-fc-dark-60">Campos recebidos: {last.devices.sampleKeys.join(', ')}</p>
                  )}
                </div>
              ) : (
                <>
                  <Row k="Equipamentos na Intranet" v={`${last.devices.total.toLocaleString('pt-PT')}${last.devices.mode ? ` (pedido ${last.devices.mode})` : ''}`} />
                  <Row k="IMEIs guardados" v={last.devices.upserted.toLocaleString('pt-PT')} />
                  <Row k="Sem cliente associado" v={last.devices.withoutClient.toLocaleString('pt-PT')} />
                  {last.devices.error && <Row k="Aviso" v={<span className="text-[#c7830b]">{last.devices.error}</span>} />}
                </>
              )}
            </div>
          )}

          </div>

          {autoCreated > 0 && (
            <div className="space-y-2 border border-fc-warning bg-fc-warning/10 px-4 py-3">
              <p>
                <b>{autoCreated.toLocaleString('pt-PT')} cliente(s)</b> foram criados automaticamente por uma sincronização anterior
                (não têm intervenções nem dados da folha). Pode passá-los para <b>Por associar</b> para os ligar a clientes já existentes.
              </p>
              <Button
                variant="secondary"
                disabled={syncing}
                onClick={() => {
                  if (!confirm(`Passar ${autoCreated} cliente(s) criados automaticamente para "Por associar"?`)) return
                  start(async () => {
                    const r = await revertAutoCreated()
                    if (!r.ok) alert(r.error)
                    router.refresh()
                  })
                }}
              >
                Rever clientes criados automaticamente
              </Button>
            </div>
          )}

          <PendingAccounts pending={pending} candidates={candidates} />

          <LinkedAccounts accounts={linked} candidates={candidates} />

          {!last.error && last.unmatchedLocal.length > 0 && (
            <details className="border border-fc-dark-20">
              <summary className="cursor-pointer px-4 py-2.5 font-bold uppercase">
                Clientes da BD ainda sem ligação à Intranet ({candidates.length})
              </summary>
              <p className="fc-small px-4 pt-2 text-fc-dark-60">
                Ficam disponíveis para escolher na lista acima. Os que não corresponderem a nenhuma conta são clientes antigos e mantêm-se para o histórico.
              </p>
              <ul className="max-h-72 columns-2 gap-6 overflow-y-auto px-4 py-2 md:columns-3">
                {candidates.map(c => <li key={c.id} className="break-inside-avoid py-0.5">{c.name}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
