/**
 * Migração Google Sheet -> PostgreSQL / Railway (schema gestao_interv)
 *
 * Uso:
 *   npm run migrate:dry               # não toca na BD; gera migration_report.json
 *   npm run migrate                   # migra (idempotente: pode correr várias vezes)
 *   npx tsx migrate.ts --no-create    # não cria valores em falta nas tabelas de apoio
 *
 * Pré-requisito: npm run db:schema (cria as tabelas).
 * DATABASE_URL em .env.local — no Railway, copiar o DATABASE_PUBLIC_URL do serviço Postgres.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { parse } from 'csv-parse/sync'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '.env.local' })

const DRY_RUN = process.argv.includes('--dry-run')
const NO_CREATE = process.argv.includes('--no-create')
const SCHEMA = 'gestao_interv'
const BATCH = 500

const ROOT = path.join(__dirname, '..')
const LISTS_CSV = path.join(ROOT, 'Validação de formulários e controlo logistica - Listas de dados - NÃO MEXER.csv')
const MAIN_CSV = path.join(ROOT, 'Validação de formulários e controlo logistica - Validação de Formulários .csv')

// ---------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------
const norm = (s: unknown): string =>
  (s ?? '').toString().toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

const clean = (s: unknown): string | null => {
  const v = (s ?? '').toString().replace(/\s+/g, ' ').trim()
  return v === '' ? null : v
}

const NAO_APLICAVEL = /^n[aã]o\s*aplic[aá]vel$/i
const PLACEHOLDERS = new Set(['-', '--', 'na', 'n/a', 'n.a.', 'nenhum', 'nenhuma', '#ref!', '#n/a', '?'])

/** Valor "vazio" para campos de identificação / FK (matrícula, IMEI, armazéns, acessórios...) */
const val = (s: unknown): string | null => {
  const v = clean(s)
  if (!v) return null
  if (PLACEHOLDERS.has(v.toLowerCase()) || NAO_APLICAVEL.test(v)) return null
  return v
}

const okNotOk = (s: unknown): string | null => {
  const n = norm(s)
  if (!n || n === 'na') return null
  if (n === 'ok') return 'Ok'
  if (n === 'notok' || n === 'nok') return 'NotOk'
  return clean(s)
}

/** Plataforma na Sheet é um estado (Ok/NotOk); outros valores são ruído */
const onlyOkNotOk = (s: unknown): string | null => {
  const v = okNotOk(s)
  return v === 'Ok' || v === 'NotOk' ? v : null
}

const vendaAluguer = (s: unknown): string | null => {
  const n = norm(s)
  if (n === 'venda') return 'Venda'
  if (n === 'aluguer') return 'Aluguer'
  return val(s)
}

const nosVdf = (s: unknown): string | null => {
  const n = norm(s)
  if (n === 'nos') return 'NOS'
  if (n === 'vodafone' || n === 'vdf') return 'Vodafone'
  return val(s)
}

const simNao = (s: unknown): string | null => {
  const v = clean(s)
  if (!v) return null
  const n = norm(v)
  if (n === 'sim') return 'Sim'
  if (n === 'nao') return 'Não'
  if (NAO_APLICAVEL.test(v)) return 'Não aplicável'
  if (n === 'na' || n === 'nenhum') return null
  return v
}

/** Datas seriais do Excel (ex.: 44761) → dd/mm/aaaa, mantendo texto livre como está */
const excelSerialToText = (s: unknown): string | null => {
  const v = val(s)
  if (v && /^\d{5}$/.test(v)) {
    const n = Number(v)
    if (n > 40000 && n < 60000) {
      const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
      return d.toISOString().slice(0, 10).split('-').reverse().join('/')
    }
  }
  return v
}

const MESES: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
}

const toISODate = (s: unknown): string | null => {
  const v = clean(s)
  if (!v) return null
  const m = v.replace(/\s/g, '').match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  const year = y.length === 2 ? `20${y}` : y
  const iso = `${year}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
  return isNaN(Date.parse(iso)) ? null : iso
}

// ---------------------------------------------------------------------------
// Colunas da folha principal (por posição; o cabeçalho é validado)
// ---------------------------------------------------------------------------
const EXPECTED_HEADER = [
  'ano', 'mes', 'dataintervencao', 'tecnico', 'datavalidacao', 'cliente', 'vendaaluguer', 'nosvdf',
  'reportprojeto', 'tipodeintervencao', 'matricula', 'imei', 'equipamentos',
  'garantiaequipamento1anoaluguerpago3anos', 'containtranet', 'matriculaintranet', 'motivo',
  'acaoefetuadadescricaointervencao', 'materialassistido', 'equipamentogasto', 'imeiequipamentogasto',
  'acessoriosgastosi', 'acessoriosgastosii', 'acessoriosgastosiii', 'acessoriosgastosiv', 'acessoriosgastosv',
  'equipamentoadarentrada', 'acessoriosadarentradai', 'acessoriosadarentradaii', 'acessoriosadarentradaiii',
  'acessoriosadarentradaiv', 'acessoriosadarentradav', 'faturar', 'observacoesfaturacao', 'emailfaturacao',
  'bundle', 'dtcativorealtimetacografo', 'configuracao', 'plataforma', 'observacoes', 'wow',
  'servicosativodesativo', 'validadopor', 'viaturacrm', 'contratoadenda', 'formulariozoho',
  'armazemdesaidadestock', 'armazemdeentradadestock',
]
const C = Object.fromEntries(EXPECTED_HEADER.map((k, i) => [k, i])) as Record<string, number>

/**
 * Layout antigo (2022 / início 2023): várias colunas estão deslocadas na Sheet.
 * Detetado por linha: código de bundle em "email faturação", Ok/NotOk em "Bundle"
 * ou Sim/Não em "Acessórios a dar entrada V".
 */
const LEGACY_CUTOFF = '2023-01-01'
const isLegacyRow = (r: string[], date: string | null) => {
  if (date && date < LEGACY_CUTOFF) return true
  return /^t[b]?\d+$/i.test((r[C.emailfaturacao] || '').trim()) ||
    ['ok', 'notok'].includes(norm(r[C.bundle])) ||
    ['sim', 'nao'].includes(norm(r[C.acessoriosadarentradav])) ||
    // iniciais do validador em "Serviços ativo/desativo" e colunas novas vazias
    (/^[A-Z]{2}$/.test((r[C.servicosativodesativo] || '').trim()) &&
      (!clean(r[C.validadopor]) || /crm/i.test(r[C.validadopor])) && !clean(r[C.armazemdesaidadestock]))
}

// ---------------------------------------------------------------------------
// Tabelas de apoio
// ---------------------------------------------------------------------------
type Lookup = { table: string; listColumns: string[]; createFromData: boolean }
const LOOKUPS: Record<string, Lookup> = {
  technicians:       { table: 'technicians',        listColumns: ['Técnicos', 'Validação Backoffice'], createFromData: true },
  interventionTypes: { table: 'intervention_types', listColumns: ['Intervenção'],                       createFromData: true },
  motives:           { table: 'motives',            listColumns: ['Motivo'],                            createFromData: false },
  actions:           { table: 'actions_performed',  listColumns: ['Ação efetuada'],                     createFromData: false },
  equipment:         { table: 'equipment_list',     listColumns: ['Equipamentos'],                      createFromData: true },
  bundles:           { table: 'bundles',            listColumns: ['Bundles'],                           createFromData: true },
  accessories:       { table: 'accessories',        listColumns: ['Acessórios gastos'],                 createFromData: false },
  billing:           { table: 'billing_options',    listColumns: ['faturar'],                           createFromData: false },
  warehouses:        { table: 'warehouses',         listColumns: ['Armazém de saida de stock', 'Armazém de Entrada de stock'], createFromData: true },
  intranetAccounts:  { table: 'intranet_accounts',  listColumns: ['Contas Intranet'],                   createFromData: false },
  warranty:          { table: 'warranty_options',   listColumns: ['Garantia Equipamento (1 ano) / Aluguer pago (3 anos)'], createFromData: false },
  platforms:         { table: 'platforms',          listColumns: [],                                    createFromData: true },
}

type RefMap = Map<string, { id: string; name: string }>

async function main() {
  console.log(`--- Migração ${DRY_RUN ? '(DRY-RUN, sem escrita na BD)' : ''} ---`)

  const sql = DRY_RUN
    ? (null as unknown as postgres.Sql)
    : postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {}, connection: { search_path: `${SCHEMA},public` } })
  if (!DRY_RUN && !process.env.DATABASE_URL) throw new Error('DATABASE_URL não definido em .env.local')

  // 1. Ler CSVs (UTF-8!)
  const lists: Record<string, string>[] = parse(fs.readFileSync(LISTS_CSV, 'utf8'), { columns: true, bom: true, skip_empty_lines: true })
  const rowsRaw: string[][] = parse(fs.readFileSync(MAIN_CSV, 'utf8'), { bom: true, relax_column_count: true })
  const header = rowsRaw.shift()!.map(norm)
  EXPECTED_HEADER.forEach((k, i) => {
    if (header[i] !== k) throw new Error(`Cabeçalho inesperado na coluna ${i}: "${header[i]}" (esperado "${k}"). A Sheet mudou de estrutura?`)
  })
  // Ano e Mês são fórmulas na Sheet: linhas só com essas duas colunas estão vazias
  const rows = rowsRaw.filter(r => r.slice(2).some(c => c && c.trim()))
  console.log(`Linhas na folha principal: ${rows.length}`)

  const listCol = (name: string) => {
    const key = Object.keys(lists[0]).find(k => norm(k) === norm(name))
    if (!key) throw new Error(`Coluna "${name}" não encontrada nas Listas de dados`)
    return lists.map(l => val(l[key])).filter(Boolean) as string[]
  }

  // 2. Carregar tabelas de apoio existentes
  const maps: Record<string, RefMap> = {}
  const loadMap = async (key: string) => {
    const m: RefMap = new Map()
    if (DRY_RUN) {
      // Simula a BD com as Listas de dados
      for (const col of LOOKUPS[key].listColumns) for (const n of listCol(col)) m.set(norm(n), { id: `dry:${n}`, name: n })
    } else {
      const data = await sql<{ id: string; name: string }[]>`select id, name from ${sql(LOOKUPS[key].table)}`
      for (const i of data) m.set(norm(i.name), i)
    }
    maps[key] = m
  }
  for (const key of Object.keys(LOOKUPS)) await loadMap(key)

  // Clientes
  const clientMap: RefMap = new Map()
  const loadClients = async () => {
    clientMap.clear()
    if (DRY_RUN) {
      for (const n of listCol('Cliente')) clientMap.set(norm(n), { id: `dry:${n}`, name: n })
    } else {
      const data = await sql<{ id: string; name: string }[]>`select id, name from clients`
      for (const c of data) clientMap.set(norm(c.name), c)
    }
  }
  await loadClients()

  // 3. Mapear cada linha para o formato da BD (valores em texto; FKs resolvidas depois)
  const layoutCount = { atual: 0, antigo: 0 }
  const keyCounter = new Map<string, number>()
  const issues = { semData: [] as number[], semCliente: 0, dataPorFallback: 0 }

  const mapped = rows.map((r, idx) => {
    const sheetRow = idx + 2
    const g = (k: string) => r[C[k]]
    const legacy = isLegacyRow(r, toISODate(g('dataintervencao')))
    layoutCount[legacy ? 'antigo' : 'atual']++

    // Data da intervenção com fallback: data validação -> Ano/Mês
    let date = toISODate(g('dataintervencao'))
    if (!date) {
      date = toISODate(g('datavalidacao'))
      if (!date) {
        const ano = clean(g('ano')); const mes = MESES[norm(g('mes')).slice(0, 3)]
        if (ano && mes) date = `${ano}-${mes}-01`
      }
      if (date) issues.dataPorFallback++
      else issues.semData.push(sheetRow)
    }

    const base = {
      intervention_date: date,
      validation_date: toISODate(g('datavalidacao')),
      technician: val(g('tecnico')),
      client: val(g('cliente')),
      venda_aluguer: vendaAluguer(g('vendaaluguer')),
      nos_vdf: nosVdf(g('nosvdf')),
      report_projeto: clean(g('reportprojeto')),
      intervention_type: val(g('tipodeintervencao')),
      license_plate: val(g('matricula'))?.toUpperCase() ?? null,
      imei: val(g('imei')),
      equipment: val(g('equipamentos')),
      warranty_rental: excelSerialToText(g('garantiaequipamento1anoaluguerpago3anos')),
      intranet_account: val(g('containtranet')),
      intranet_license_plate: val(g('matriculaintranet'))?.toUpperCase() ?? null,
      motive_text: val(g('motivo')),
      action_description: val(g('acaoefetuadadescricaointervencao')),
      assisted_material: val(g('materialassistido')),
      contract_addendum: val(g('contratoadenda')),
      zoho_form: val(g('formulariozoho')),
      stock_exit_warehouse: val(g('armazemdesaidadestock')),
      stock_entry_warehouse: val(g('armazemdeentradadestock')),
      legacy_layout: legacy ? '2022' : 'atual',
    }

    const variant = legacy
      ? {
          spent_equipment: null,
          spent_equipment_imei: null,
          accessory_spent_1: val(g('imeiequipamentogasto')),
          accessory_spent_2: val(g('acessoriosgastosi')),
          accessory_spent_3: val(g('acessoriosgastosii')),
          accessory_spent_4: val(g('acessoriosgastosiii')),
          accessory_spent_5: null,
          equipment_return: null,
          accessory_return_1: null, accessory_return_2: null, accessory_return_3: null,
          accessory_return_4: null, accessory_return_5: null,
          billing: simNao(g('acessoriosadarentradav')),
          billing_observations: val(g('faturar')),
          billing_email: null,
          bundle: val(g('emailfaturacao')),
          configuration: okNotOk(g('bundle')),
          dtc_active_realtime: okNotOk(g('dtcativorealtimetacografo')),
          platform: onlyOkNotOk(g('configuracao')),
          canbus_via: val(g('plataforma')),
          observations: val(g('observacoes')),
          wow: val(g('wow')),
          validated_by: val(g('servicosativodesativo')),
          services_status: null,
          crm_vehicle: val(g('validadopor')),
        }
      : {
          spent_equipment: val(g('equipamentogasto')),
          spent_equipment_imei: val(g('imeiequipamentogasto')),
          accessory_spent_1: val(g('acessoriosgastosi')),
          accessory_spent_2: val(g('acessoriosgastosii')),
          accessory_spent_3: val(g('acessoriosgastosiii')),
          accessory_spent_4: val(g('acessoriosgastosiv')),
          accessory_spent_5: val(g('acessoriosgastosv')),
          equipment_return: val(g('equipamentoadarentrada')),
          accessory_return_1: val(g('acessoriosadarentradai')),
          accessory_return_2: val(g('acessoriosadarentradaii')),
          accessory_return_3: val(g('acessoriosadarentradaiii')),
          accessory_return_4: val(g('acessoriosadarentradaiv')),
          accessory_return_5: val(g('acessoriosadarentradav')),
          billing: simNao(g('faturar')),
          billing_observations: val(g('observacoesfaturacao')),
          billing_email: val(g('emailfaturacao')),
          bundle: val(g('bundle')),
          configuration: okNotOk(g('configuracao')),
          dtc_active_realtime: okNotOk(g('dtcativorealtimetacografo')),
          platform: onlyOkNotOk(g('plataforma')),
          canbus_via: null,
          observations: val(g('observacoes')),
          wow: val(g('wow')),
          validated_by: val(g('validadopor')),
          services_status: val(g('servicosativodesativo')),
          crm_vehicle: val(g('viaturacrm')),
        }

    // Chave estável para upsert idempotente: usa só os campos preenchidos na criação do registo,
    // para que edições posteriores na Sheet (validação, faturação...) atualizem em vez de duplicar.
    const fingerprint = ['dataintervencao', 'tecnico', 'cliente', 'tipodeintervencao', 'matricula', 'imei', 'equipamentos']
      .map(k => norm(g(k))).join('|')
    const h = crypto.createHash('sha1').update(fingerprint).digest('hex').slice(0, 20)
    const n = (keyCounter.get(h) || 0) + 1
    keyCounter.set(h, n)
    const legacy_key = `${h}-${n}`

    return { sheetRow, legacy_key, ...base, ...variant }
  })

  // 4. Criar valores em falta nas tabelas de apoio
  const need: Record<string, Map<string, string>> = {}
  const want = (key: string, name: string | null) => {
    if (!name) return
    const m = key === 'clients' ? clientMap : maps[key]
    if (m.has(norm(name))) return
    ;(need[key] ??= new Map()).set(norm(name), name)
  }
  // a) listas da Sheet -> garante que os dropdowns ficam completos
  for (const [key, lk] of Object.entries(LOOKUPS)) for (const col of lk.listColumns) for (const n of listCol(col)) want(key, n)
  // b) valores usados nas intervenções
  const clientExtra = new Map<string, any>()
  for (const m of mapped) {
    want('technicians', m.technician); want('technicians', m.validated_by)
    want('interventionTypes', m.intervention_type); want('equipment', m.equipment)
    want('bundles', m.bundle); want('warehouses', m.stock_exit_warehouse); want('warehouses', m.stock_entry_warehouse)
    want('platforms', m.platform)
    if (m.client && !clientMap.has(norm(m.client))) {
      want('clients', m.client)
      if (!clientExtra.has(norm(m.client))) clientExtra.set(norm(m.client), { venda_aluguer: m.venda_aluguer, nos_vdf: m.nos_vdf })
    }
  }
  // Só criar a partir dos dados nas tabelas marcadas com createFromData (motivos ficam em motive_text)
  for (const [key, lk] of Object.entries(LOOKUPS)) {
    if (!need[key]) continue
    if (!lk.createFromData) {
      const fromLists = new Set(lk.listColumns.flatMap(c => listCol(c)).map(norm))
      for (const k of [...need[key].keys()]) if (!fromLists.has(k)) need[key].delete(k)
    }
  }

  const created: Record<string, string[]> = {}
  for (const [key, names] of Object.entries(need)) {
    if (!names.size) continue
    created[key] = [...names.values()]
    if (DRY_RUN || NO_CREATE) continue
    const table = key === 'clients' ? 'clients' : LOOKUPS[key].table
    const payload = [...names.entries()].map(([k, name]) =>
      key === 'clients'
        ? { name, active: true, venda_aluguer: clientExtra.get(k)?.venda_aluguer ?? null, nos_vdf: clientExtra.get(k)?.nos_vdf ?? null }
        : { name, active: true })
    for (let i = 0; i < payload.length; i += BATCH) {
      await sql`insert into ${sql(table)} ${sql(payload.slice(i, i + BATCH))} on conflict do nothing`
    }
    console.log(`Criados ${payload.length} registos em ${table}`)
  }
  if (!DRY_RUN) {
    for (const key of Object.keys(LOOKUPS)) await loadMap(key)
    await loadClients()
  } else {
    for (const [key, names] of Object.entries(need)) {
      const m = key === 'clients' ? clientMap : maps[key]
      for (const [k, name] of names) m.set(k, { id: `new:${name}`, name })
    }
  }

  // 5. Resolver FKs e construir registos finais
  const id = (key: string, name: string | null) => (name ? maps[key].get(norm(name))?.id ?? null : null)
  const unmatchedMotives = new Map<string, number>()

  const records = mapped.map(m => {
    const motive_id = id('motives', m.motive_text)
    if (m.motive_text && !motive_id) unmatchedMotives.set(m.motive_text, (unmatchedMotives.get(m.motive_text) || 0) + 1)
    const client_id = m.client ? clientMap.get(norm(m.client))?.id ?? null : null
    if (!client_id) issues.semCliente++
    return {
      legacy_key: m.legacy_key,
      legacy_layout: m.legacy_layout,
      material_migrated: false, // re-converte material gasto/retomado para as listas
      intervention_date: m.intervention_date,
      validation_date: m.validation_date,
      technician_id: id('technicians', m.technician),
      client_id,
      venda_aluguer: m.venda_aluguer,
      nos_vdf: m.nos_vdf,
      report_projeto: m.report_projeto,
      intervention_type_id: id('interventionTypes', m.intervention_type),
      license_plate: m.license_plate,
      imei: m.imei,
      equipment_id: id('equipment', m.equipment),
      warranty_rental: m.warranty_rental,
      intranet_account: m.intranet_account,
      intranet_license_plate: m.intranet_license_plate,
      motive_id,
      motive_text: m.motive_text,
      action_description: m.action_description,
      assisted_material: m.assisted_material,
      spent_equipment: m.spent_equipment,
      spent_equipment_imei: m.spent_equipment_imei,
      accessory_spent_1: m.accessory_spent_1,
      accessory_spent_2: m.accessory_spent_2,
      accessory_spent_3: m.accessory_spent_3,
      accessory_spent_4: m.accessory_spent_4,
      accessory_spent_5: m.accessory_spent_5,
      equipment_return: m.equipment_return,
      accessory_return_1: m.accessory_return_1,
      accessory_return_2: m.accessory_return_2,
      accessory_return_3: m.accessory_return_3,
      accessory_return_4: m.accessory_return_4,
      accessory_return_5: m.accessory_return_5,
      billing: m.billing,
      billing_observations: m.billing_observations,
      billing_email: m.billing_email,
      bundle_id: id('bundles', m.bundle),
      dtc_active_realtime: m.dtc_active_realtime,
      configuration: m.configuration,
      platform_id: id('platforms', m.platform),
      canbus_via: m.canbus_via,
      observations: m.observations,
      wow: m.wow,
      services_status: m.services_status,
      validated_by: id('technicians', m.validated_by),
      crm_vehicle: m.crm_vehicle,
      contract_addendum: m.contract_addendum,
      zoho_form: m.zoho_form,
      stock_exit_warehouse_id: id('warehouses', m.stock_exit_warehouse),
      stock_entry_warehouse_id: id('warehouses', m.stock_entry_warehouse),
    }
  })

  const toWrite = records.filter(r => r.intervention_date)

  // 6. Escrever (upsert por legacy_key)
  let ok = 0, failed = 0
  if (!DRY_RUN) {
    for (let i = 0; i < toWrite.length; i += BATCH) {
      const batch = toWrite.slice(i, i + BATCH)
      try {
        const cols = Object.keys(batch[0])
        const updates = cols.filter(c => c !== 'legacy_key')
        await sql`
          insert into interventions ${sql(batch as any, cols as any)}
          on conflict (legacy_key) do update set
          ${sql.unsafe(updates.map(c => `"${c}" = excluded."${c}"`).join(', '))}
        `
        ok += batch.length
        console.log(`Gravados ${ok} / ${toWrite.length}`)
      } catch (e) {
        failed += batch.length
        console.error(`Erro no lote ${i}-${i + batch.length}: ${(e as Error).message}`)
      }
    }
  }

  // 7. Relatório
  const fill = (k: keyof typeof records[number]) => records.filter(r => r[k] !== null && r[k] !== undefined).length
  const report = {
    geradoEm: new Date().toISOString(),
    modo: DRY_RUN ? 'dry-run' : 'real',
    linhas: rows.length,
    layout: layoutCount,
    gravados: DRY_RUN ? 0 : ok,
    falhados: failed,
    ignoradosSemData: issues.semData,
    dataPorFallback: issues.dataPorFallback,
    semCliente: issues.semCliente,
    preenchimento: Object.fromEntries(Object.keys(records[0]).map(k => [k, fill(k as any)])),
    criadosNasTabelasDeApoio: created,
    motivosSemCorrespondencia: { distintos: unmatchedMotives.size, linhas: [...unmatchedMotives.values()].reduce((a, b) => a + b, 0), top30: [...unmatchedMotives.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30) },
    amostra: { atual: records.find(r => r.legacy_layout === 'atual'), antigo: records.find(r => r.legacy_layout === '2022') },
  }
  if (!DRY_RUN && ok > 0) {
    const [{ n }] = await sql`select gestao_interv.backfill_material() as n`
    console.log(`Material gasto/retomado ligado às listas em ${n} registos`)
  }
  if (!DRY_RUN) await sql.end()
  fs.writeFileSync(path.join(__dirname, 'migration_report.json'), JSON.stringify(report, null, 2), 'utf8')
  console.log(`\nLayout atual: ${layoutCount.atual} | layout antigo (2022): ${layoutCount.antigo}`)
  console.log(`Sem data (ignoradas): ${issues.semData.length} | data por fallback: ${issues.dataPorFallback} | sem cliente: ${issues.semCliente}`)
  console.log(`Relatório: migration_report.json`)
  console.log('--- Fim ---')
}

main().catch(e => { console.error('FALHOU:', e.message); process.exit(1) })
