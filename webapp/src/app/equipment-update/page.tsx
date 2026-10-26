import { can } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { FirmwareUpgrade } from '@/components/settings/FirmwareUpgrade'

/** Atualização de equipamentos (firmware e CAN chip) — disponível para todos os utilizadores */
export default async function EquipmentUpdatePage() {
  if (!can(await requireUser(), 'equipment')) redirect('/help')
  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1>Atualização de equipamento</h1>
        <p className="fc-small text-fc-dark-60">Pedir a atualização de firmware do equipamento ou do CAN chip na Intranet.</p>
      </div>
      <div className="border border-fc-dark-20 bg-white p-5">
        <FirmwareUpgrade />
      </div>
    </div>
  )
}
