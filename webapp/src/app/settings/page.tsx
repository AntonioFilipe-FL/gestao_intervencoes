import { getReferenceData } from '@/services/database'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsTable } from '@/components/settings/SettingsTable'
import { isAdmin } from '@/actions/users'
import { UserManagement } from '@/components/settings/UserManagement'
import { EmailSettings } from '@/components/settings/EmailSettings'
import { IntranetSettings } from '@/components/settings/IntranetSettings'
import { getLastSync, intranetConfigured } from '@/lib/intranet'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; sender_ok?: string; sender_error?: string }>
}) {
  const params = await searchParams
  const data = await getReferenceData(false)
  const userIsAdmin = await isAdmin()

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <div>
        <h1>Configurações</h1>
        <p className="fc-small text-fc-dark-60">Gerir tabelas de referência e listas de apoio.</p>
      </div>

      <Tabs defaultValue={userIsAdmin && (params.tab === 'email' || params.tab === 'intranet') ? params.tab : 'technicians'} className="gap-0 border border-fc-dark-20 bg-white">
        <TabsList>
          <TabsTrigger value="technicians">Técnicos</TabsTrigger>
          <TabsTrigger value="clients">Clientes</TabsTrigger>
          <TabsTrigger value="equipment">Equipamentos</TabsTrigger>
          <TabsTrigger value="accessories">Acessórios</TabsTrigger>
          <TabsTrigger value="intervention_types">Tipos Interv.</TabsTrigger>
          <TabsTrigger value="motives">Motivos</TabsTrigger>
          <TabsTrigger value="warehouses">Armazéns</TabsTrigger>
          <TabsTrigger value="bundles">Bundles</TabsTrigger>
          {userIsAdmin && (
            <TabsTrigger value="users">Utilizadores</TabsTrigger>
          )}
          {userIsAdmin && (
            <TabsTrigger value="email">Email</TabsTrigger>
          )}
          {userIsAdmin && (
            <TabsTrigger value="intranet">Intranet</TabsTrigger>
          )}
        </TabsList>

        <div className="p-5">
            <TabsContent value="technicians">
              <SettingsTable title="Lista de Técnicos" table="technicians" items={data.technicians} />
            </TabsContent>

            <TabsContent value="clients">
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
              <SettingsTable title="Lista de Equipamentos" table="equipment_list" items={data.equipmentList} />
            </TabsContent>

            <TabsContent value="accessories">
              <SettingsTable title="Lista de Acessórios" table="accessories" items={data.accessories} />
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
                extraColumns={[{ label: 'Tipo', key: 'type' }]}
              />
            </TabsContent>

            <TabsContent value="bundles">
              <SettingsTable title="Lista de Bundles" table="bundles" items={data.bundles} />
            </TabsContent>

            {userIsAdmin && (
              <TabsContent value="users">
                <UserManagement />
              </TabsContent>
            )}
            {userIsAdmin && (
              <TabsContent value="email">
                <EmailSettings ok={params.sender_ok === '1'} error={params.sender_error} />
              </TabsContent>
            )}
            {userIsAdmin && (
              <TabsContent value="intranet">
                <IntranetSettings configured={intranetConfigured()} last={await getLastSync()} />
              </TabsContent>
            )}
          </div>
      </Tabs>
    </div>
  )
}
