import { BusyLink } from '@/components/BusyActions'
import { can } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { FirmwareUpgrade } from '@/components/settings/FirmwareUpgrade'
import { FirmwareHistory } from '@/components/FirmwareHistory'
import { getFirmwareHistory, refreshFirmwareResults } from '@/actions/firmware'

type Params = { q?: string; kind?: string; from?: string; to?: string; hist?: string }

/** Atualização de equipamentos (firmware e CAN chip); o histórico só aparece ao super admin */
export default async function EquipmentUpdatePage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser()
  if (!can(user, 'equipment')) redirect('/help')
  const params = await searchParams
  // super admin: confirma primeiro na Intranet o estado dos pedidos pendentes (Atualizado / Falhou / Pendente)
  // só quando pedido (botão "Ver histórico"), para a página abrir depressa
  const showHist = user.superadmin && params.hist === '1'
  const check = showHist ? await refreshFirmwareResults() : null
  const history = showHist ? await getFirmwareHistory(params) : null
  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1>Atualização de equipamento</h1>
        <p className="fc-small text-fc-dark-60">Pedir a atualização de firmware do equipamento ou do CAN chip na Intranet.</p>
      </div>
      <div className="border border-fc-dark-20 bg-white p-5">
        <FirmwareUpgrade />
      </div>
      {user.superadmin && !history && (
        <div className="border border-fc-dark-20 bg-white p-5">
          <BusyLink href="/equipment-update?hist=1" label="Ver histórico de atualizações" busyLabel="A carregar o histórico…" className="inline-block bg-fc-dark-100 px-4 py-2 text-white" />
          <p className="mt-2 fc-small text-fc-dark-60">Ao abrir, a app confirma na Intranet o estado dos pedidos pendentes (pode demorar uns segundos).</p>
        </div>
      )}
      {history && (
        <div className="border border-fc-dark-20 bg-white p-5">
          <FirmwareHistory rows={history} params={params} check={check} />
        </div>
      )}
    </div>
  )
}
