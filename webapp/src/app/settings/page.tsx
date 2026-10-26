import { CrmModality } from '@/components/settings/CrmModality'
import { AccessoryMapping } from '@/components/settings/AccessoryMapping'
import { getAccessoryMapping } from '@/actions/accessory-stock'
import { zohoConfigured } from '@/lib/zoho'
import { redirect } from 'next/navigation'
import { getReferenceData } from '@/services/database'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsTable } from '@/components/settings/SettingsTable'
import { isAdmin } from '@/actions/users'
import { getCurrentUser } from '@/lib/auth'
import { getStockMinMargin } from '@/lib/stock-settings'
import { SuperAdminSettings } from '@/components/settings/SuperAdminSettings'
import { IntranetPlates } from '@/components/settings/IntranetPlates'
import { FirmwareUpgrade } from '@/components/settings/FirmwareUpgrade'
import { sql } from '@/lib/db'
import { UserManagement } from '@/components/settings/UserManagement'
import { EmailSettings } from '@/components/settings/EmailSettings'
import { IntranetSettings } from '@/components/settings/IntranetSettings'
import { HardwareMapping } from '@/components/settings/HardwareMapping'
import { getHardwareList } from '@/actions/intranet'
import { listAutoCreatedClients, countAutoCreatedClients, getLastSync, getLinkedAccounts, getPendingAccounts, intranetConfigured } from '@/lib/intranet'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sender_ok?: string; sender_error?: string }>
}) {
  const params = await searchParams
  const data = await getReferenceData(false)
  const userIsAdmin = await isAdmin()
  if (!userIsAdmin) redirect('/interventions')
  const me = await getCurrentUser()
  const margin = me?.superadmin ? await getStockMinMargin() : 20

  return (
    <div className="mx-auto max-w-[1920px] space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1>Configurações</h1>
        <p className="fc-small text-fc-dark-60">Gerir tabelas de referência e listas de apoio.</p>
      </div>

      <Tabs defaultValue={userIsAdmin && (params.tab === 'email' || params.tab === 'intranet' || params.tab === 'superadmin') ? params.tab : 'technicians'} className="gap-0 border border-fc-dark-20 bg-white">
        <TabsList>
          <TabsTrigger value="technicians">Técnicos</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="equipment">Equipamentos</TabsTrigger>
          <TabsTrigger value="accessories">Acessórios</TabsTrigger>
          <TabsTrigger value="accessory_stock">Stock acessórios</TabsTrigger>
          <TabsTrigger value="intervention_types">Tipos Interv.</TabsTrigger>
          <TabsTrigger value="motives">Motivos</TabsTrigger>
          <TabsTrigger value="warehouses">Armazéns</TabsTrigger>
          <TabsTrigger value="bundles">Bundles</TabsTrigger>
          {me?.superadmin && (
            <TabsTrigger value="users">Utilizadores</TabsTrigger>
          )}
          {userIsAdmin && (
            <TabsTrigger value="email">Email</TabsTrigger>
          )}
          {userIsAdmin && (
            <TabsTrigger value="intranet">Intranet</TabsTrigger>
          )}
          {me?.superadmin && <TabsTrigger value="superadmin">Super admin</TabsTrigger>}
        </TabsList>

        <div className="p-5">
            {me?.superadmin && (
              <TabsContent value="superadmin">
                <div className="space-y-8">
                  <SuperAdminSettings margin={margin} />
                  <hr className="border-fc-dark-20" />
                  <IntranetPlates warehouses={await sql<{ id: string; name: string }[]>`select id, name from warehouses where active and type <> 'mobilizado' order by name`} />
                  <hr className="border-fc-dark-20" />
                  <FirmwareUpgrade warehouses={await sql<{ id: string; name: string }[]>`select id, name from warehouses where active and type <> 'mobilizado' order by name`} />
                </div>
              </TabsContent>
            )}
            <TabsContent value="technicians">
              <SettingsTable title="Lista de Técnicos" table="technicians" items={data.technicians} extraColumns={[{ label: 'Email (login)', key: 'email' }]} />
            </TabsContent>

            <TabsContent value="clients">
              <CrmModality configured={zohoConfigured()} />
              <SettingsTable 
                title="Lista de Clientes" 
                table="clients"
                items={data.clients} 
                extraColumns={[
                  { label: 'Venda/Aluguer', key: 'venda_aluguer' },
                  { label: 'NOS/VDF', key: 'nos_vdf' },
                  { label: 'ID Intranet', key: 'intranet_account_id', readOnly: true }
                ]}
              />
            </TabsContent>

            <TabsContent value="equipment">
              <SettingsTable
                title="Lista de Equipamentos"
                table="equipment_list"
                items={data.equipmentList}
                catalog
                kit={{ accessories: (data.accessories ?? []).filter((a) => a.active), kits: data.equipmentKits }}
              />
              {userIsAdmin && (
                <div className="mt-6">
                  <HardwareMapping rows={await getHardwareList()} equipment={(data.equipmentList ?? []).filter((e) => e.active)} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="accessories">
              <SettingsTable title="Lista de Acessórios" table="accessories" items={data.accessories} catalog />
            </TabsContent>

            <TabsContent value="intervention_types">
              <SettingsTable title="Tipos de Intervenção" table="intervention_types" items={data.interventionTypes} />
            </TabsContent>

            <TabsContent value="motives">
              <SettingsTable title="Lista de Motivos" table="motives" items={data.motives} />
            </TabsContent>

            <TabsContent value="warehouses">
              <SettingsTable 
                title="Lista de Armazéns" 
                table="warehouses"
                items={data.warehouses} 
                extraColumns={[{ label: 'Tipo', key: 'type', options: [
                  { value: 'ambos', label: 'Entrada e saída' },
                  { value: 'saida', label: 'Só saída' },
                  { value: 'entrada', label: 'Só entrada' },
                  { value: 'mobilizado', label: 'Instalado aluguer (mobilizado)' },
                ] }]}
              />
            </TabsContent>

            <TabsContent value="bundles">
              <SettingsTable title="Lista de Bundles" table="bundles" items={data.bundles} />
            </TabsContent>

            {me?.superadmin && (
              <TabsContent value="users">
                <UserManagement />
              </TabsContent>
            )}
            {userIsAdmin && (
              <TabsContent value="accessory_stock">
                <AccessoryMapping {...(await getAccessoryMapping())} />
              </TabsContent>
            )}
            {userIsAdmin && (
              <TabsContent value="email">
                <EmailSettings ok={params.sender_ok === '1'} error={params.sender_error} />
              </TabsContent>
            )}
            {userIsAdmin && (
              <TabsContent value="intranet">
                <IntranetSettings configured={intranetConfigured()} last={await getLastSync()} {...(await getPendingAccounts())} autoCreated={await countAutoCreatedClients()} autoCreatedList={await listAutoCreatedClients()} linked={await getLinkedAccounts()} />
              </TabsContent>
            )}
          </div>
      </Tabs>
    </div>
  )
}
