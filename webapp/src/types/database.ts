export interface ReferenceItem {
  id: string
  name: string
  active: boolean
}

export interface ClientItem extends ReferenceItem {
  venda_aluguer?: string
  nos_vdf?: string
  report_projeto_contrato?: string
}

export interface WarehouseItem extends ReferenceItem {
  type: 'saida' | 'entrada' | 'ambos'
}

export interface ReferenceData {
  technicians: ReferenceItem[] | null
  interventionTypes: ReferenceItem[] | null
  motives: ReferenceItem[] | null
  actionsPerformed: ReferenceItem[] | null
  equipmentList: ReferenceItem[] | null
  bundles: ReferenceItem[] | null
  accessories: ReferenceItem[] | null
  billingOptions: ReferenceItem[] | null
  warehouses: WarehouseItem[] | null
  intranetAccounts: ReferenceItem[] | null
  warrantyOptions: ReferenceItem[] | null
  platforms: ReferenceItem[] | null
  clients: ClientItem[] | null
}
