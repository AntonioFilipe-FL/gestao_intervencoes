import fs from 'fs'
import path from 'path'
import { parse } from 'csv-parse/sync'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import ws from 'ws'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
  realtime: { transport: ws }
})

const LISTS_CSV_PATH = path.join(__dirname, '../Validação de formulários e controlo logistica - Listas de dados - NÃO MEXER.csv')
const INTERVENTIONS_CSV_PATH = path.join(__dirname, '../Validação de formulários e controlo logistica - Validação de Formulários .csv')

// Função para normalizar strings (remover acentos, espaços e por em minusculo)
function normalize(str: string | null | undefined): string {
  if (!str) return ''
  return str.toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9]/g, '')      // Remove tudo o que não é letra ou número
    .trim()
}

async function migrate() {
  console.log('--- Iniciando Migração Robusta ---')

  const idMaps: any = {}

  // 1. Carregar Tabelas de Referência
  console.log('Sincronizando tabelas de referência...')
  const refTables = {
    technicians: 'technicians',
    interventionTypes: 'intervention_types',
    motives: 'motives',
    equipmentList: 'equipment_list',
    bundles: 'bundles',
    warehouses: 'warehouses',
    platforms: 'platforms'
  }
  
  for (const [key, table] of Object.entries(refTables)) {
    const { data } = await supabase.schema('gestao_interv').from(table).select('id, name')
    // Mapear pela versão normalizada do nome
    idMaps[key] = Object.fromEntries(data?.map(i => [normalize(i.name), i.id]) || [])
  }

  // 2. Clientes
  console.log('Migrando clientes...')
  const listsContent = fs.readFileSync(LISTS_CSV_PATH, 'latin1')
  const listsData = parse(listsContent, { columns: true, skip_empty_lines: true, trim: true })

  const clientsToInsert: any[] = []
  const seenClients = new Set()

  listsData.forEach((row: any) => {
    // Tentar encontrar a coluna de cliente ignorando encoding
    const clientKey = Object.keys(row).find(k => normalize(k).includes('cliente'))
    const name = clientKey ? row[clientKey]?.trim() : null
    
    if (name && name !== 'NA' && !seenClients.has(normalize(name))) {
      clientsToInsert.push({
        name,
        venda_aluguer: row['Venda / Aluguer'],
        nos_vdf: row['NOS / VDF'],
        report_projeto_contrato: row['Report / Projeto / contrato'],
        active: true
      })
      seenClients.add(normalize(name))
    }
  })

  const { data: clientsData, error: clientsError } = await supabase.schema('gestao_interv').from('clients').upsert(clientsToInsert, { onConflict: 'name' }).select()
  if (clientsError) console.error('Erro em clients:', clientsError.message)
  idMaps.clients = Object.fromEntries(clientsData?.map(c => [normalize(c.name), c.id]) || [])

  // 3. Intervenções
  console.log('Processando intervenções...')
  const interventionsContent = fs.readFileSync(INTERVENTIONS_CSV_PATH, 'latin1')
  const interventionsData = parse(interventionsContent, { columns: true, skip_empty_lines: true })

  // Helper para encontrar chave no objeto da linha de forma flexível
  const getRowVal = (row: any, search: string) => {
    const key = Object.keys(row).find(k => normalize(k).includes(normalize(search)))
    return key ? row[key]?.toString().trim() : null
  }

  const findId = (map: any, name: string | null) => {
    if (!name) return null
    return map[normalize(name)] || null
  }

  const formatDate = (d: string | null) => {
    if (!d || d === 'NA' || d === 'N/A' || d === '-' || d.trim() === '') return null
    const cleanDate = d.trim().replace(/\s/g, '')
    const parts = cleanDate.split('/')
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0')
      const month = parts[1].padStart(2, '0')
      let year = parts[2]
      if (year.length === 2) year = `20${year}`
      return `${year}-${month}-${day}`
    }
    return null
  }

  const batchSize = 50
  for (let i = 0; i < interventionsData.length; i += batchSize) {
    const batch = interventionsData.slice(i, i + batchSize)
    const toInsert = batch.map((row: any) => {
      // Extrair valores usando nomes flexíveis
      const clientName = getRowVal(row, 'cliente')
      const techName = getRowVal(row, 'tecnico')
      const typeName = getRowVal(row, 'tipointervencao')
      const motiveName = getRowVal(row, 'motivo')
      const equipName = getRowVal(row, 'equipamento')
      const exitW = getRowVal(row, 'armazemsaida')
      const entryW = getRowVal(row, 'armazementrada')
      const validator = getRowVal(row, 'validadopor')
      const bundle = getRowVal(row, 'bundle')
      const platform = getRowVal(row, 'plataforma')

      return {
        intervention_date: formatDate(getRowVal(row, 'dataintervencao')) || new Date().toISOString().split('T')[0],
        validation_date: formatDate(getRowVal(row, 'datavalidacao')),
        technician_id: findId(idMaps.technicians, techName),
        client_id: findId(idMaps.clients, clientName),
        venda_aluguer: getRowVal(row, 'vendaaluguer'),
        nos_vdf: getRowVal(row, 'nosvdf'),
        report_projeto: getRowVal(row, 'reportprojeto'),
        intervention_type_id: findId(idMaps.interventionTypes, typeName),
        license_plate: getRowVal(row, 'matricula'),
        imei: getRowVal(row, 'imei'),
        equipment_id: findId(idMaps.equipmentList, equipName),
        warranty_rental: getRowVal(row, 'garantiaequipamento'),
        intranet_account: getRowVal(row, 'containtranet'),
        intranet_license_plate: getRowVal(row, 'matriculaintranet'),
        motive_id: findId(idMaps.motives, motiveName),
        action_description: getRowVal(row, 'acaoefetuada'),
        assisted_material: getRowVal(row, 'materialassistido'),
        spent_equipment: getRowVal(row, 'equipamentogasto'),
        spent_equipment_imei: getRowVal(row, 'imeiequipamentogasto'),
        accessory_spent_1: getRowVal(row, 'acessoriosgastosi'),
        accessory_spent_2: getRowVal(row, 'acessoriosgastosii'),
        accessory_spent_3: getRowVal(row, 'acessoriosgastosiii'),
        accessory_spent_4: getRowVal(row, 'acessoriosgastosiv'),
        accessory_spent_5: getRowVal(row, 'acessoriosgastosv'),
        equipment_return: getRowVal(row, 'equipamentoadar'),
        accessory_return_1: getRowVal(row, 'acessoriosadar1'),
        accessory_return_2: getRowVal(row, 'acessoriosadar2'),
        accessory_return_3: getRowVal(row, 'acessoriosadar3'),
        accessory_return_4: getRowVal(row, 'acessoriosadar4'),
        accessory_return_5: getRowVal(row, 'acessoriosadar5'),
        billing: getRowVal(row, 'faturar'),
        billing_observations: getRowVal(row, 'observacoesfaturacao'),
        billing_email: getRowVal(row, 'emailfaturacao'),
        bundle_id: findId(idMaps.bundles, bundle),
        dtc_active_realtime: getRowVal(row, 'dtcactive'),
        configuration: getRowVal(row, 'configuracao'),
        platform_id: findId(idMaps.platforms, platform),
        observations: getRowVal(row, 'observacoes'),
        wow: getRowVal(row, 'wow'),
        services_status: getRowVal(row, 'servicosativo'),
        validated_by: findId(idMaps.technicians, validator),
        crm_vehicle: getRowVal(row, 'viaturacrm'),
        contract_addendum: getRowVal(row, 'contratoadenda'),
        zoho_form: getRowVal(row, 'formulariozoho'),
        stock_exit_warehouse_id: findId(idMaps.warehouses, exitW),
        stock_entry_warehouse_id: findId(idMaps.warehouses, entryW),
      }
    }).filter(item => item.client_id !== null)

    if (toInsert.length > 0) {
      const { error } = await supabase.schema('gestao_interv').from('interventions').insert(toInsert)
      if (error) console.error(`Erro no lote ${i}:`, error.message)
      else console.log(`Processados ${i + toInsert.length} de ${interventionsData.length}`)
    }
  }

  console.log('--- Migração Concluída com Sucesso ---')
}

migrate()
