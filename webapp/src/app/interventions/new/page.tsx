import { can } from '@/lib/permissions'
import { redirect } from 'next/navigation'
import { getReferenceData } from '@/services/database'
import { InterventionForm } from '@/components/interventions/InterventionForm'
import { requireUser } from '@/lib/auth'
import { billingRecipients } from '@/lib/billing-notification'
import { getClientOptions } from '@/lib/intranet'
import { sql } from '@/lib/db'
import { creatorRecordUrl, resolveRegisteredDrafts } from '@/lib/creator-import'
import { matchEquipment } from '@/lib/hardware'
import type { ReferenceData } from '@/types/database'
import type { InterventionFormInput } from '@/lib/schemas/intervention'

export default async function NewInterventionPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const user = await requireUser()
  if (!can(user, 'interventions', 'write')) redirect('/interventions')
  // ?draft=<id>: pré-preenche a partir de um formulário do Creator por confirmar (só admin)
  const { draft: draftId } = await searchParams
  // os formulários cuja intervenção já foi registada à mão saem da lista antes de abrir
  if (draftId) await resolveRegisteredDrafts().catch(() => 0)
  const [draft] = draftId && /^[0-9a-f-]{36}$/i.test(draftId) && user.role === 'admin'
    ? await sql<{ id: string; form_values: Record<string, string>; notes: string[]; form_type: string | null; id_record: string | null; creator_id: string; ticket: string | null }[]>`
        select id, form_values, notes, form_type, id_record, creator_id, ticket from intervention_drafts where id = ${draftId} and status = 'pending'`
    : []
  if (draftId && !draft) redirect('/interventions/drafts')
  const [referenceData, clientOptions, [validator]] = await Promise.all([
    getReferenceData(),
    getClientOptions(draft?.form_values.client_id),
    sql<{ id: string; name: string }[]>`select id, name from technicians where lower(email) = lower(${user.email}) limit 1`,
  ])
  const prefill = draft ? await buildPrefill(draft, referenceData) : undefined

  return (
    <div>
      <InterventionForm referenceData={referenceData} billingRecipients={billingRecipients()} clientOptions={clientOptions} validator={validator ?? null}
        prefill={prefill} />
    </div>
  )
}

type Draft = { id: string; form_values: Record<string, string>; notes: string[]; form_type: string | null; id_record: string | null; creator_id: string; ticket: string | null }
const fold = (v: string) => v.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')

/**
 * Valores e notas de um formulário do Creator por confirmar: link do formulário, ticket e acessórios gastos
 * sugeridos a partir do texto (descrição e material). Tudo é para o admin confirmar antes de gravar.
 */
async function buildPrefill(draft: Draft, ref: ReferenceData) {
  const values: Partial<InterventionFormInput> = { ...draft.form_values }
  values.zoho_form = creatorRecordUrl(draft.form_type, draft.id_record, draft.creator_id)
  if (draft.ticket) values.ticket = draft.ticket
  // notas legíveis: sem identificadores internos nem "Com assinatura"; true/false → Sim/Não
  const notes = draft.notes
    .filter((n) => !/^Com assinatura:/.test(n) && !/^Tipo de intervenção \(Creator\): \d+$/.test(n))
    .map((n) => n.replace(/: true$/, ': Sim').replace(/: false$/, ': Não'))

  // --- sem IMEI no formulário (ex.: Troca de Viatura, Upgrade sem troca): o equipamento da viatura segundo a Intranet ---
  if (!values.imei) {
    const oldPlate = draft.notes.find((n) => n.startsWith('Matrícula antiga:'))?.replace(/^[^:]+:\s*/, '') ?? ''
    for (const [plate, label] of [[draft.form_values.license_plate ?? '', 'matrícula'], [oldPlate, 'matrícula antiga']] as const) {
      if (plate.replace(/[^A-Za-z0-9]/g, '').length < 6) continue
      const found = await sql<{ imei: string }[]>`
        select imei from devices where active and gestao_interv.plate_norm(license_plate) = gestao_interv.plate_norm(${plate}) limit 2`
      if (found.length === 1) {
        values.imei = found[0].imei
        draft.form_values.imei = found[0].imei
        notes.push(`IMEI ${found[0].imei} obtido pela ${label} ${plate} na Intranet (o formulário não traz IMEI) — confirmar.`)
        break
      }
    }
    if (!values.imei) notes.push('⚠ O formulário não traz IMEI e não foi encontrado pela matrícula na Intranet — escolher no formulário.')
  }

  // --- acessórios gastos sugeridos pelo texto do formulário ---
  const material = draft.notes.filter((n) => /^(Material gasto|Descrição\/quantidades do material|Acessórios substituídos|Ligações efetuadas):/.test(n)).join(' ')
  const text = `${draft.form_values.action_description ?? ''} ${material}`
  const ftext = fold(text)
  const accessories = (ref.accessories ?? []).filter((a) => a.active !== false)
  // modelo do equipamento da viatura, para escolher entre acessórios do mesmo género (ex.: "Antena C4MAX" vs "Antena GPS FMC6x0")
  const [dev] = draft.form_values.imei ? await sql<{ model: string | null }[]>`select model from devices where imei = ${draft.form_values.imei} limit 1` : []
  const eqName = matchEquipment(dev?.model, ref.equipmentList ?? [], ref.hardwareMap ?? [])?.item.name ?? ''
  const picked = new Map<string, string>() // id → nome
  const doubts: string[] = []
  // 1) nome completo do acessório escrito no texto
  for (const a of accessories) if (fold(a.name).length >= 5 && ftext.includes(fold(a.name))) picked.set(a.id, a.name)
  // 2) género do acessório (1.ª palavra do nome: antena, cabo, cablagem…) + verbo de substituição/colocação
  if (/substitu|troca|trocad|colocad|aplicad|instalad|nov[oa]\b/i.test(text)) {
    const groups = new Map<string, typeof accessories>()
    for (const a of accessories) {
      const kw = fold(a.name.split(/\s+/)[0] ?? '')
      if (kw.length >= 4) groups.set(kw, [...(groups.get(kw) ?? []), a])
    }
    for (const [kw, list] of groups) {
      if (!ftext.includes(kw) || list.some((a) => picked.has(a.id))) continue
      const eqTokens = eqName.split(/\s+/).map(fold).filter((t) => t.length >= 3)
      const byEq = list.filter((a) => eqTokens.some((t) => fold(a.name).includes(t)))
      const choice = list.length === 1 ? list[0] : byEq.length === 1 ? byEq[0] : null
      if (choice) picked.set(choice.id, choice.name)
      else doubts.push(`⚠ O formulário fala em “${list[0].name.split(/\s+/)[0].toLowerCase()}” — escolher qual nos acessórios gastos (${list.slice(0, 4).map((a) => a.name).join(', ')}${list.length > 4 ? '…' : ''}).`)
    }
  }
  // 3) lista "quantidade + material" do formulário (ex.: "1 relé 24v, 2 sensores de porta, 24 mt cabo duplo")
  const qty = new Map<string, number>()
  const synonyms = await sql<{ term: string; accessory_id: string | null }[]>`select term, accessory_id from accessory_synonyms`.catch(() => [])
  const notFound: string[] = []
  const tokens = (v: string) => v.split(/[^A-Za-zÀ-ÿ0-9]+/).map(fold).filter((t) => t.length >= 2).map((t) => (t.length > 3 ? t.replace(/(es|s)$/, '') : t))
  const listText = draft.notes.filter((n) => /^(Descrição\/quantidades do material|Material gasto):/.test(n)).map((n) => n.replace(/^[^:]+:\s*/, '')).join(', ')
  for (const raw of listText.split(/[,;\n]+|\s+e\s+/).map((x) => x.trim()).filter(Boolean)) {
    const m = raw.match(/^(\d{1,3})\s*(?:x|un\.?|unid\.?|mts?|metros?|m)?\s+(.+)$/i)
    if (!m) continue
    // sinónimo definido em Configurações › Acessórios (texto igual ou contido no item) — ganha a tudo o resto
    const fitem = fold(m[2])
    const syn = synonyms.find((x) => x.term === fitem) ?? synonyms.filter((x) => x.term.length >= 4 && fitem.includes(x.term)).sort((x, y) => y.term.length - x.term.length)[0]
    if (syn) {
      const a = syn.accessory_id && accessories.find((x) => x.id === syn.accessory_id)
      if (a) { picked.set(a.id, a.name); qty.set(a.id, Math.min(99, (qty.get(a.id) ?? 0) + Number(m[1]))) }
      continue // sinónimo "sem stock": ignora o item
    }
    const want = tokens(m[2])
    if (!want.length) continue
    // candidatos: acessórios cujo nome contém todas as palavras do item (por prefixo)
    const cands = accessories.map((a) => ({ a, t: tokens(a.name) })).filter(({ t }) => want.every((w) => t.some((x) => x.startsWith(w) || w.startsWith(x))))
    const best = cands.sort((x, y) => x.t.length - y.t.length)
    const choice = best.length === 1 || (best.length > 1 && best[0].t.length < best[1].t.length) ? best[0].a : null
    if (choice) { picked.set(choice.id, choice.name); qty.set(choice.id, Math.min(99, Number(m[1]))) }
    else if (best.length) doubts.push(`⚠ “${raw}” — escolher qual nos acessórios gastos (${best.slice(0, 4).map((c) => c.a.name).join(', ')}${best.length > 4 ? '…' : ''}).`)
    else notFound.push(raw)
  }
  if (notFound.length) doubts.push(`⚠ Sem correspondência na lista de acessórios: ${notFound.join(', ')} — escolher à mão; para a app aprender, acrescente o sinónimo em Configurações › Acessórios.`)

  // --- equipamento gasto: sai do armazém onde ESTÁ; a modalidade passa a ser a do cliente ao gravar ---
  const tech = (ref.technicians ?? []).find((t) => t.id === draft.form_values.technician_id)
  const techWh = tech && (ref.warehouses ?? []).find((w) => fold(w.name) === fold(tech.name))
  const spentImei = draft.form_values.spent_equipment_imei
  if (spentImei) {
    const [st] = await sql<{ warehouse_id: string | null; warehouse: string | null; mobilized: boolean; modality: string | null }[]>`
      select c.warehouse_id, w.name as warehouse, (w.type = 'mobilizado') as mobilized, c.modality
      from stock_current c left join warehouses w on w.id = c.warehouse_id where c.imei = ${spentImei}`
    if (st?.warehouse_id && !st.mobilized) {
      values.stock_exit_warehouse_id = st.warehouse_id
      if (techWh && techWh.id !== st.warehouse_id) notes.push(`⚠ O equipamento ${spentImei} está no armazém ${st.warehouse} (não no do técnico ${tech!.name}): o armazém de saída ficou ${st.warehouse}.`)
    } else {
      notes.push(`⚠ O equipamento ${spentImei} não está em stock em nenhum armazém${st?.mobilized ? ' (está no Instalado Aluguer)' : ''} — confirmar o armazém de saída.`)
    }
    const clientMod = (ref.clients ?? []).find((c) => c.id === draft.form_values.client_id)?.venda_aluguer ?? ''
    const cm = /alug/i.test(clientMod) ? 'Aluguer' : /vend/i.test(clientMod) ? 'Venda' : ''
    if (cm && st?.modality && st.modality !== cm)
      notes.push(`⚠ O equipamento ${spentImei} está em stock como ${st.modality} e o cliente é de ${cm}: ao gravar, passa a ${cm}${cm === 'Aluguer' ? ' (vai para o Instalado Aluguer)' : ' (sai do stock como vendido)'}.`)
  }

  if (picked.size) {
    values.accessories_spent = [...picked.keys()].map((accessory_id) => ({ accessory_id, quantity: qty.get(accessory_id) ?? 1 }))
    notes.push(`Acessórios gastos sugeridos pelo texto (confirmar e ajustar quantidades): ${[...picked.entries()].map(([id, n]) => `${qty.get(id) ?? 1}× ${n}`).join(', ')}`)
    // saem do armazém do técnico, se ainda não houver armazém de saída
    if (!values.stock_exit_warehouse_id && techWh) values.stock_exit_warehouse_id = techWh.id
  }
  notes.push(...doubts)
  return { draftId: draft.id, values, notes }
}
