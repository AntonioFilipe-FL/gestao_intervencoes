/**
 * Testes automáticos às regras de stock (as que vivem na base de dados: vistas e funções do db/schema.sql).
 *
 *   npm run test:stock
 *
 * Corre TUDO dentro de uma transação que é sempre desfeita (ROLLBACK): cria técnico, armazéns, clientes, equipamentos
 * e intervenções de teste com IMEIs fictícios, verifica o stock e no fim não fica nada gravado.
 * Usa TEST_DATABASE_URL se existir; senão DATABASE_URL (.env.local).
 */
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '.env.local' })
const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL não definido (.env.local)'); process.exit(1) }
const sql = postgres(url, { max: 1, onnotice: () => {}, connection: { search_path: 'gestao_interv,public' } })

class Rollback extends Error {}
const results: { name: string; ok: boolean; detail?: string }[] = []
const rnd = () => Math.random().toString(36).slice(2, 8).toUpperCase()
let imeiSeq = 0
/** IMEI fictício de 15 dígitos (começa por 99, não colide com IMEIs reais) */
const newImei = () => `99${String(Date.now()).slice(-9)}${String(++imeiSeq).padStart(4, '0')}`

async function main() {
  await sql.begin(async (tx) => {
    const check = (name: string, got: unknown, want: unknown) => {
      const ok = JSON.stringify(got) === JSON.stringify(want)
      results.push({ name, ok, detail: ok ? undefined : `esperado ${JSON.stringify(want)}, obtido ${JSON.stringify(got)}` })
    }
    const tag = rnd()
    const one = async <T,>(q: Promise<T[]>) => (await q)[0]
    // ---------- dados de teste ----------
    const tech = await one(tx<{ id: string; name: string }[]>`insert into technicians (name) values (${'T' + tag}) returning id, name`)
    const whA1 = await one(tx<{ id: string }[]>`insert into warehouses (name, type) values (${'A1 - Teste ' + tag}, 'ambos') returning id`)
    const whA2 = await one(tx<{ id: string }[]>`insert into warehouses (name, type) values (${'A2 - Teste ' + tag}, 'ambos') returning id`)
    const whTech = await one(tx<{ id: string }[]>`insert into warehouses (name, type) values (${tech.name}, 'ambos') returning id`)
    const [{ mob }] = await tx<{ mob: string | null }[]>`select gestao_interv.mobilized_wh() as mob`
    if (!mob) throw new Error('Não existe o armazém "Instalado Aluguer (Mobilizado)".')
    const cVenda = await one(tx<{ id: string }[]>`insert into clients (name, venda_aluguer) values (${'Cliente Venda ' + tag}, 'Venda') returning id`)
    const cAlug = await one(tx<{ id: string }[]>`insert into clients (name, venda_aluguer) values (${'Cliente Aluguer ' + tag}, 'Aluguer') returning id`)
    const eq = await one(tx<{ id: string }[]>`insert into equipment_list (name) values (${'EQ' + tag}) returning id`)
    const typeId = async (name: string) =>
      (await one(tx<{ id: string }[]>`select id from intervention_types where lower(btrim(name)) = lower(${name}) limit 1`))?.id ??
      (await one(tx<{ id: string }[]>`insert into intervention_types (name) values (${name}) returning id`)).id
    const tInst = await typeId('Instalação'), tDes = await typeId('Desinstalação'), tAss = await typeId('Assistência')

    const stock = async (imei: string) => {
      const r = await one(tx<{ warehouse_id: string | null; modality: string | null }[]>`select warehouse_id, modality from stock_current where imei = ${imei}`)
      return r ? { wh: r.warehouse_id, mod: r.modality } : null
    }
    const day = (n: number) => `2026-11-${String(n).padStart(2, '0')}`
    const move = (o: Record<string, unknown>) => tx`insert into stock_movements ${tx({ equipment_id: null, created_by: 'teste', ...o })}`
    const receive = (imei: string, wh: string, modality: string, d: number) => move({ imei, equipment_id: eq.id, kind: 'rececao', to_warehouse_id: wh, modality, moved_at: day(d) })
    const transfer = (imei: string, from: string, to: string, d: number, extra: Record<string, unknown> = {}) => move({ imei, kind: 'transferencia', from_warehouse_id: from, to_warehouse_id: to, moved_at: day(d), ...extra })
    const interv = async (o: Record<string, unknown>) => {
      const row = await one(tx<{ id: string }[]>`insert into interventions ${tx({ technician_id: tech.id, material_migrated: true, created_by: 'teste', ...o })} returning id`)
      await tx`select gestao_interv.sync_intervention_stock(${row.id})`
      await tx`select gestao_interv.supersede_corrections(${row.id})`
      return row.id
    }

    // ---------- 1. Receção e transferência ----------
    const a = newImei()
    await receive(a, whA1.id, 'Venda', 1)
    check('1a. Receção: o IMEI fica em stock no armazém de receção, como Venda', await stock(a), { wh: whA1.id, mod: 'Venda' })
    await transfer(a, whA1.id, whTech.id, 2)
    check('1b. Transferência: passa para o armazém do técnico e mantém a modalidade', await stock(a), { wh: whTech.id, mod: 'Venda' })

    // ---------- 2. Instalação em cliente de Venda: sai do stock ----------
    await interv({ intervention_date: day(3), client_id: cVenda.id, venda_aluguer: 'Venda', intervention_type_id: tInst, license_plate: 'AA-00-AA',
      imei: a, spent_equipment_imei: a, spent_equipment_id: eq.id, stock_exit_warehouse_id: whTech.id })
    check('2. Instalação em cliente de Venda: sai do stock (vendido)', await stock(a), { wh: null, mod: 'Venda' })

    // ---------- 3. Instalação em cliente de Aluguer: vai para o Mobilizado ----------
    const b = newImei()
    await receive(b, whA2.id, 'Aluguer', 1)
    await transfer(b, whA2.id, whTech.id, 2)
    const instB = await interv({ intervention_date: day(3), client_id: cAlug.id, venda_aluguer: 'Aluguer', intervention_type_id: tInst, license_plate: 'BB-00-BB',
      imei: b, spent_equipment_imei: b, spent_equipment_id: eq.id, stock_exit_warehouse_id: whTech.id })
    check('3. Instalação em cliente de Aluguer: vai para o Instalado Aluguer (Mobilizado)', await stock(b), { wh: mob, mod: 'Aluguer' })

    // ---------- 4. Modalidade do equipamento ≠ modalidade do cliente: fica a do cliente ----------
    const c = newImei()
    await receive(c, whA2.id, 'Aluguer', 1)
    await interv({ intervention_date: day(3), client_id: cVenda.id, venda_aluguer: 'Venda', intervention_type_id: tInst, license_plate: 'CC-00-CC',
      imei: c, spent_equipment_imei: c, spent_equipment_id: eq.id, stock_exit_warehouse_id: whA2.id })
    check('4a. Equipamento de Aluguer instalado em cliente de Venda: sai do stock como Venda', await stock(c), { wh: null, mod: 'Venda' })
    const d = newImei()
    await receive(d, whA1.id, 'Venda', 1)
    await interv({ intervention_date: day(3), client_id: cAlug.id, venda_aluguer: 'Aluguer', intervention_type_id: tInst, license_plate: 'DD-00-DD',
      imei: d, spent_equipment_imei: d, spent_equipment_id: eq.id, stock_exit_warehouse_id: whA1.id })
    check('4b. Equipamento de Venda instalado em cliente de Aluguer: vai para o Mobilizado como Aluguer', await stock(d), { wh: mob, mod: 'Aluguer' })

    // ---------- 5. Desinstalação de aluguer: do Mobilizado para o armazém de entrada ----------
    await interv({ intervention_date: day(5), client_id: cAlug.id, venda_aluguer: 'Aluguer', intervention_type_id: tDes, license_plate: 'BB-00-BB',
      imei: b, equipment_id: eq.id, return_equipment_imei: b, return_equipment_id: eq.id, return_modality: 'Aluguer', stock_entry_warehouse_id: whTech.id })
    check('5. Desinstalação de aluguer: o equipamento volta ao armazém de entrada, como Aluguer', await stock(b), { wh: whTech.id, mod: 'Aluguer' })

    // ---------- 6. Troca de equipamento numa assistência: sai o novo, entra o antigo ----------
    const novo = newImei()
    await receive(novo, whTech.id, 'Aluguer', 4)
    await interv({ intervention_date: day(6), client_id: cAlug.id, venda_aluguer: 'Aluguer', intervention_type_id: tAss, license_plate: 'DD-00-DD',
      imei: d, spent_equipment_imei: novo, spent_equipment_id: eq.id, stock_exit_warehouse_id: whTech.id,
      return_equipment_imei: d, return_equipment_id: eq.id, return_modality: 'Aluguer', stock_entry_warehouse_id: whTech.id })
    check('6a. Troca em assistência: o equipamento novo fica instalado (Mobilizado)', await stock(novo), { wh: mob, mod: 'Aluguer' })
    check('6b. Troca em assistência: o equipamento antigo entra no armazém de entrada', await stock(d), { wh: whTech.id, mod: 'Aluguer' })

    // ---------- 7. Editar e apagar uma intervenção desfaz os seus movimentos ----------
    const e1 = newImei(), e2 = newImei()
    await receive(e1, whTech.id, 'Venda', 1); await receive(e2, whTech.id, 'Venda', 1)
    const instE = await interv({ intervention_date: day(3), client_id: cVenda.id, venda_aluguer: 'Venda', intervention_type_id: tInst, license_plate: 'EE-00-EE',
      imei: e1, spent_equipment_imei: e1, spent_equipment_id: eq.id, stock_exit_warehouse_id: whTech.id })
    await tx`update interventions set imei = ${e2}, spent_equipment_imei = ${e2} where id = ${instE}`
    await tx`select gestao_interv.sync_intervention_stock(${instE})`
    check('7a. Corrigir o IMEI de uma intervenção: o IMEI errado volta ao stock', await stock(e1), { wh: whTech.id, mod: 'Venda' })
    check('7b. Corrigir o IMEI de uma intervenção: o IMEI certo sai do stock', await stock(e2), { wh: null, mod: 'Venda' })
    await tx`delete from interventions where id = ${instE}`
    check('7c. Apagar a intervenção: o equipamento volta ao stock', await stock(e2), { wh: whTech.id, mod: 'Venda' })

    // ---------- 8. Ajuste (dar saída) e anulação ----------
    const f = newImei()
    await receive(f, whA1.id, 'Venda', 1)
    const adj = await one(tx<{ id: string }[]>`insert into stock_movements ${tx({ imei: f, equipment_id: null, kind: 'ajuste', from_warehouse_id: whA1.id, to_warehouse_id: null, moved_at: day(4), is_correction: true, created_by: 'teste', notes: 'teste' })} returning id`)
    check('8a. Ajuste / dar saída: o IMEI sai do stock', (await stock(f))?.wh ?? null, null)
    await tx`update stock_movements set superseded_at = now(), cancelled = true where id = ${adj.id}`
    check('8b. Anular o ajuste: o IMEI volta ao armazém', (await stock(f))?.wh ?? null, whA1.id)
    // a "reparação" do schema (que repõe correções substituídas) não pode desfazer uma anulação feita à mão
    const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8')
    const repair = schema.match(/update gestao_interv\.stock_movements m set superseded_at = null[\s\S]*?;/)?.[0]
    if (!repair) results.push({ name: '8c. Reparação do schema encontrada no db/schema.sql', ok: false, detail: 'instrução não encontrada' })
    else {
      await tx.unsafe(repair)
      check('8c. Correr o db:schema não desfaz uma anulação', (await stock(f))?.wh ?? null, whA1.id)
    }

    // ---------- 9. Mudança de modalidade sem mudar de armazém ----------
    const g = newImei()
    await receive(g, whA1.id, 'Venda', 1)
    await transfer(g, whA1.id, whA1.id, 2, { modality: 'Aluguer', is_correction: true })
    check('9. Mudar a modalidade: mesmo armazém, nova modalidade', await stock(g), { wh: whA1.id, mod: 'Aluguer' })

    // ---------- 10. Kit de acessórios nas transferências A1 → técnico ----------
    const acc = await one(tx<{ id: string }[]>`insert into accessories (name) values (${'ACC' + tag}) returning id`)
    const item = await one(tx<{ id: string }[]>`insert into accessory_stock_items (name) values (${'ITEM' + tag}) returning id`)
    await tx`insert into accessory_stock_map (accessory_id, item_id) values (${acc.id}, ${item.id})`
    await tx`insert into equipment_kit_items (equipment_id, accessory_id, quantity) values (${eq.id}, ${acc.id}, 2)`
    const accQty = async (wh: string) => (await one(tx<{ quantity: number }[]>`select quantity from accessory_stock where item_id = ${item.id} and warehouse_id = ${wh}`))?.quantity ?? 0
    const k1 = newImei(), k2 = newImei()
    await receive(k1, whA1.id, 'Venda', 1); await receive(k2, whA1.id, 'Venda', 1)
    // (as transferências anteriores deste teste também contam para o kit: comparam-se as diferenças)
    const t0 = await accQty(whTech.id), a0 = await accQty(whA1.id)
    await transfer(k1, whA1.id, whTech.id, 20)
    check('10a. Transferência A1 → técnico com acessórios: o kit (2 un.) entra no armazém do técnico', (await accQty(whTech.id)) - t0, 2)
    check('10b. …e sai do A1', (await accQty(whA1.id)) - a0, -2)
    const t1 = await accQty(whTech.id)
    await transfer(k2, whA1.id, whTech.id, 20, { no_kit: true })
    check('10c. Transferência "só o equipamento": os acessórios não se movimentam', (await accQty(whTech.id)) - t1, 0)

    // ---------- 11. Acessórios gastos numa intervenção saem do armazém de saída ----------
    const h = newImei()
    await receive(h, whTech.id, 'Venda', 1)
    const t2 = await accQty(whTech.id)
    const iAcc = await one(tx<{ id: string }[]>`insert into interventions ${tx({ technician_id: tech.id, material_migrated: true, created_by: 'teste', intervention_date: day(21),
      client_id: cVenda.id, venda_aluguer: 'Venda', intervention_type_id: tAss, license_plate: 'HH-00-HH', imei: h, stock_exit_warehouse_id: whTech.id })} returning id`)
    await tx`insert into intervention_accessories (intervention_id, accessory_id, direction, quantity) values (${iAcc.id}, ${acc.id}, 'gasto', 1)`
    check('11. Acessório gasto numa intervenção: sai 1 un. do armazém de saída', (await accQty(whTech.id)) - t2, -1)

    // ---------- 12. Contas internas da Frotcom: "Suspended" NÃO é interna (os equipamentos continuam instalados nos clientes) ----------
    const internal = async (account: string) => (await one(tx<{ r: boolean }[]>`select gestao_interv.is_internal_account(${account}) as r`)).r
    const acc0 = 'TEST-' + tag
    const mkAccount = async (suffix: string, name: string) => {
      const id = `${acc0}-${suffix}`
      await tx`insert into clients (name, intranet_account_id, intranet_short_name) values (${name + ' ' + tag}, ${id}, ${name})`
      return id
    }
    check('12a. Conta "Frotcom Lusitana" é interna', await internal(await mkAccount('a', 'Frotcom Lusitana')), true)
    check('12b. Conta "Frotcom Lusitana - Transit" é interna', await internal(await mkAccount('b', 'Frotcom Lusitana - Transit')), true)
    const accSusp = await mkAccount('c', 'Frotcom Lusitana - Suspended')
    check('12c. Conta "Frotcom Lusitana - Suspended" NÃO é interna', await internal(accSusp), false)
    check('12d. Conta de um cliente normal não é interna', await internal(await mkAccount('d', 'Cliente Normal')), false)
    // também para contas ainda por associar (intranet_pending)
    await tx`insert into intranet_pending (intranet_account_id, name, full_name) values (${acc0 + '-e'}, 'Frotcom Lusitana - Suspended', 'Frotcom Lusitana - Suspended')`
    await tx`insert into intranet_pending (intranet_account_id, name, full_name) values (${acc0 + '-f'}, 'Frotcom Lusitana - RMA', 'Frotcom Lusitana - RMA')`
    check('12e. Suspended ainda por associar (intranet_pending) NÃO é interna', await internal(acc0 + '-e'), false)
    check('12f. Outra conta Frotcom por associar é interna', await internal(acc0 + '-f'), true)
    check('12g. Conta desconhecida / nula não é interna', [await internal('nao-existe-' + tag), (await one(tx<{ r: boolean }[]>`select gestao_interv.is_internal_account(null) as r`)).r], [false, false])
    // um IMEI numa conta Suspended conta como instalado (como a consulta "instalados" do stock)
    const s = newImei()
    await tx`insert into devices (imei, intranet_account_id, license_plate, active) values (${s}, ${accSusp}, 'SS-00-SS', true)`
    const [inst] = await tx<{ installed: boolean }[]>`select (d.active and nullif(btrim(d.license_plate), '') is not null and not gestao_interv.is_internal_account(d.intranet_account_id)) as installed from devices d where d.imei = ${s}`
    check('12h. IMEI com matrícula numa conta Suspended conta como instalado (não é stock interno)', inst.installed, true)

    void instB
    throw new Rollback() // desfaz tudo: não fica nada gravado
  }).catch((e) => { if (!(e instanceof Rollback)) throw e })
}

main()
  .then(async () => {
    await sql.end()
    for (const r of results) console.log(`${r.ok ? '✔' : '✘'} ${r.name}${r.detail ? `\n    ${r.detail}` : ''}`)
    const bad = results.filter((r) => !r.ok).length
    console.log(`\n${results.length - bad} de ${results.length} testes passaram. Nada ficou gravado na base de dados (transação desfeita).`)
    process.exit(bad ? 1 : 0)
  })
  .catch(async (e) => { await sql.end().catch(() => {}); console.error('FALHOU a correr os testes (nada ficou gravado):', e.message); process.exit(2) })
