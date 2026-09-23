import { getReferenceData } from '@/services/database'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SettingsTable } from '@/components/settings/SettingsTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { isAdmin } from '@/actions/users'
import { UserManagement } from '@/components/settings/UserManagement'

export default async function SettingsPage() {
  const data = await getReferenceData(false)
  const userIsAdmin = await isAdmin()

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground">Gerir tabelas de referência e listas de apoio.</p>
      </div>

      <Tabs defaultValue="technicians" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 h-auto gap-2 bg-transparent p-0">
          <TabsTrigger value="technicians" className="data-[state=active]:bg-white border">Técnicos</TabsTrigger>
          <TabsTrigger value="clients" className="data-[state=active]:bg-white border">Clientes</TabsTrigger>
          <TabsTrigger value="equipment" className="data-[state=active]:bg-white border">Equipamentos</TabsTrigger>
          <TabsTrigger value="intervention_types" className="data-[state=active]:bg-white border">Tipos Interv.</TabsTrigger>
          <TabsTrigger value="motives" className="data-[state=active]:bg-white border">Motivos</TabsTrigger>
          <TabsTrigger value="warehouses" className="data-[state=active]:bg-white border">Armazéns</TabsTrigger>
          <TabsTrigger value="bundles" className="data-[state=active]:bg-white border">Bundles</TabsTrigger>
          {userIsAdmin && (
            <TabsTrigger value="users" className="data-[state=active]:bg-white border">Utilizadores</TabsTrigger>
          )}
        </TabsList>

        <Card>
          <CardContent className="pt-6">
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
                  { label: 'NOS/VDF', key: 'nos_vdf' }
                ]}
              />
            </TabsContent>

            <TabsContent value="equipment">
              <SettingsTable title="Lista de Equipamentos" table="equipment_list" items={data.equipmentList} />
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
          </CardContent>
        </Card>
      </Tabs>
    </div>
  )
}
