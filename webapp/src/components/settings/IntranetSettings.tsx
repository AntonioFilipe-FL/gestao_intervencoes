'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { runIntranetSync } from '@/actions/intranet'
import type { SyncResult } from '@/lib/intranet'

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
export function IntranetSettings({ configured, last: initial }: { configured: boolean; last: Last }) {
  const [last, setLast] = useState<Last>(initial)
  const [pending, start] = useTransition()

  const sync = () =>
    start(async () => {
      const r = await runIntranetSync()
      setLast({ ...r, at: new Date().toISOString(), by: null })
    })

  return (
    <div className="max-w-3xl space-y-5">
      <div className="space-y-1">
        <h2>Sincronização com a Intranet Frotcom</h2>
        <p className="fc-small text-fc-dark-60">
          Importa os clientes (contas) e os IMEIs da Intranet. Os clientes que já existem são ligados pelo nome;
          os novos são criados; os que deixaram de existir na Intranet ficam inativos (o histórico mantém-se).
        </p>
      </div>

      {!configured && (
        <p className="bg-fc-warning/20 px-3 py-2 text-[#c7830b]">
          Faltam as variáveis <b>INTRANET_USER</b> e <b>INTRANET_PASSWORD</b> no Railway (serviço gestao_intervencoes → Variables).
        </p>
      )}

      <Button size="lg" onClick={sync} disabled={pending || !configured}>
        <RefreshCw className={pending ? 'animate-spin' : ''} /> {pending ? 'A sincronizar…' : 'Sincronizar agora'}
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

          {!last.error && (
            <div className="border border-fc-dark-20">
              <div className="border-b border-fc-dark-20 px-4 py-2.5 font-bold uppercase">Clientes</div>
              <Row k="Contas na Intranet" v={last.accounts.total.toLocaleString('pt-PT')} />
              <Row k="Ligadas a clientes existentes" v={last.accounts.linked} />
              <Row k="Novos clientes criados" v={last.accounts.created} />
              <Row k="Nomes atualizados" v={last.accounts.renamed} />
              <Row k="Inativados (já não existem)" v={last.accounts.deactivated} />
            </div>
          )}

          {!last.error && (
            <div className="border border-fc-dark-20">
              <div className="border-b border-fc-dark-20 px-4 py-2.5 font-bold uppercase">IMEIs</div>
              {last.devices.error ? (
                <div className="space-y-1 px-4 py-3 text-[#b31d25]">
                  <p>{last.devices.error}</p>
                  {last.devices.sampleKeys && (
                    <p className="fc-small text-fc-dark-60">Campos recebidos: {last.devices.sampleKeys.join(', ')}</p>
                  )}
                </div>
              ) : (
                <>
                  <Row k="Equipamentos na Intranet" v={last.devices.total.toLocaleString('pt-PT')} />
                  <Row k="IMEIs guardados" v={last.devices.upserted.toLocaleString('pt-PT')} />
                  <Row k="Sem cliente associado" v={last.devices.withoutClient.toLocaleString('pt-PT')} />
                </>
              )}
            </div>
          )}

          {!last.error && last.unmatchedLocal.length > 0 && (
            <div className="border border-fc-dark-20">
              <div className="border-b border-fc-dark-20 px-4 py-2.5 font-bold uppercase">
                Clientes da BD sem correspondência na Intranet ({last.unmatchedLocal.length})
              </div>
              <p className="fc-small px-4 pt-2 text-fc-dark-60">
                Corrija o nome em Configurações → Clientes para ficar igual ao da Intranet e sincronize de novo.
              </p>
              <ul className="max-h-72 columns-2 gap-6 overflow-y-auto px-4 py-2 md:columns-3">
                {last.unmatchedLocal.map(n => <li key={n} className="break-inside-avoid py-0.5">{n}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
