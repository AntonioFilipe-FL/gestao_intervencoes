import { can } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { FirmwareUpgrade } from '@/components/settings/FirmwareUpgrade'
import { FirmwareHistory } from '@/components/FirmwareHistory'
import { getFirmwareHistory, refreshFirmwareResults } from '@/actions/firmware'

type Params = { q?: string; kind?: string; from?: string; to?: string }

/** Atualização de equipamentos (firmware e CAN chip); o histórico só aparece ao super admin */
export default async function EquipmentUpdatePage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser()
  if (!can(user, 'equipment')) redirect('/help')
  const params = await searchParams
  // super admin: confirma primeiro na Intranet o estado dos pedidos pendentes (Atualizado / Falhou / Pendente)
  if (user.superadmin) await refreshFirmwareResults().catch(() => 0)
  const history = user.superadmin ? await getFirmwareHistory(params) : null
  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1>Atualização de equipamento</h1>
        <p className="fc-small text-fc-dark-60">Pedir a atualização de firmware do equipamento ou do CAN chip na Intranet.</p>
      </div>
      <div className="border border-fc-dark-20 bg-white p-5">
        <FirmwareUpgrade />
      </div>
      {history && (
        <div className="border border-fc-dark-20 bg-white p-5">
          <FirmwareHistory rows={history} params={params} />
        </div>
      )}
    </div>
  )
}
