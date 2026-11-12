import 'server-only'
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import readline from 'readline'
import { Readable } from 'stream'
import postgres from 'postgres'
import { sql as live } from '@/lib/db'
import { DRIVE, backupFolder, driveJson, driveToken } from '@/lib/backup'

/**
 * Teste mensal de reposição, a correr no Railway (tarefa /api/cron/restore-test):
 * descarrega do Google Drive a cópia de segurança mais recente, repõe-na numa base de dados TEMPORÁRIA
 * (RESTORE_DATABASE_URL — um 2.º Postgres só para isto, nunca a base em uso), confere tabela a tabela e
 * verifica que as vistas de stock respondem. No fim apaga o que repôs, para a base temporária ficar vazia.
 */
const sameDb = (a: string, b: string) => {
  try { const x = new URL(a), y = new URL(b); return x.hostname === y.hostname && x.port === y.port && x.pathname === y.pathname } catch { return a === b }
}

/** Linhas da cópia mais recente no Drive: {backup…}, {table,row}…, {end,counts} */
async function latestDriveBackup() {
  const token = await driveToken()
  const folder = await backupFolder(token)
  const list = await driveJson(token, `${DRIVE}/files?q=${encodeURIComponent(`'${folder}' in parents and trashed = false`)}&fields=files(id,name,size,createdTime)&pageSize=200`)
  const files = ((list.files ?? []) as { id: string; name: string; size?: string; createdTime: string }[])
    .filter((f) => /^gestao_interv_.*\.json\.gz$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name))
  if (!files.length) throw new Error('Não há cópias no Google Drive (pasta Backup_Gestao_Interv).')
  const f = files[0]
  const r = await fetch(`${DRIVE}/files/${f.id}?alt=media`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!r.ok) throw new Error(`Google Drive (descarregar ${f.name}): HTTP ${r.status}`)
  const buf = Buffer.from(await r.arrayBuffer())
  return { name: f.name, mb: Math.round((buf.length / 1048576) * 10) / 10, ageDays: (Date.now() - new Date(f.createdTime).getTime()) / 86400000, buf }
}

async function* readLines(gz: Buffer) {
  const rl = readline.createInterface({ input: Readable.from(gz).pipe(zlib.createGunzip()), crlfDelay: Infinity })
  for await (const line of rl) if (line) yield JSON.parse(line) as Record<string, unknown>
}

export async function runRestoreTest() {
  const dest = process.env.RESTORE_DATABASE_URL
  if (!dest) throw new Error('Falta a variável RESTORE_DATABASE_URL (2.º Postgres, só para o teste de reposição).')
  if (process.env.DATABASE_URL && sameDb(process.env.DATABASE_URL, dest)) throw new Error('RESTORE_DATABASE_URL aponta para a base de dados em uso — recusado.')
  const t0 = Date.now()
  const problems: string[] = []
  const backup = await latestDriveBackup()
  if (backup.ageDays > 3) problems.push(`A cópia mais recente (${backup.name}) tem ${Math.floor(backup.ageDays)} dias — a cópia diária pode ter deixado de correr.`)

  // 1) resumo e integridade da cópia
  let head: { at?: string; tables?: string[] } = {}
  let counts: Record<string, number> | null = null
  const seen: Record<string, number> = {}
  for await (const o of readLines(backup.buf)) {
    if (o.backup) head = o as typeof head
    else if (o.end) counts = o.counts as Record<string, number>
    else seen[o.table as string] = (seen[o.table as string] ?? 0) + 1
  }
  if (!counts) throw new Error(`A cópia ${backup.name} está incompleta (sem a linha final).`)
  const tables = head.tables ?? []
  for (const t of tables) if ((seen[t] ?? 0) !== (counts[t] ?? 0)) throw new Error(`Cópia ${backup.name}: a tabela ${t} diz ${counts[t]} registos mas tem ${seen[t] ?? 0}.`)

  const sql = postgres(dest, { max: 1, onnotice: () => {}, connect_timeout: 20 })
  let restoredInterv = 0
  try {
    // 2) base temporária limpa + esquema atual
    await sql`drop schema if exists gestao_interv cascade`
    await sql.unsafe(fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8'))
    const existing = new Set((await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'gestao_interv' and table_type = 'BASE TABLE'`).map((t) => t.table_name))
    const missing = tables.filter((t) => !existing.has(t))
    if (missing.length) throw new Error(`O esquema atual não tem tabelas que a cópia tem: ${missing.join(', ')}`)

    // 3) reposição (mesma técnica do scripts/restore-db.ts)
    await sql.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      for (const t of tables) await tx`truncate table ${tx('gestao_interv')}.${tx(t)} cascade`
      let batch: unknown[] = [], cur = ''
      const flush = async () => {
        if (!batch.length) return
        await tx.unsafe(`insert into gestao_interv."${cur}" select * from jsonb_populate_recordset(null::gestao_interv."${cur}", $1::text::jsonb)`, [JSON.stringify(batch)])
        batch = []
      }
      for await (const o of readLines(backup.buf)) {
        if (!o.table) continue
        if (o.table !== cur) { await flush(); cur = o.table as string }
        batch.push(o.row)
        if (batch.length >= 1000) await flush()
      }
      await flush()
    })

    // 4) confere tabela a tabela
    for (const t of tables) {
      const [{ c }] = (await sql.unsafe(`select count(*)::int as c from gestao_interv."${t}"`)) as unknown as { c: number }[]
      if (c !== counts[t]) problems.push(`Tabela ${t}: esperado ${counts[t]}, ficou ${c}.`)
    }
    // 5) os dados repostos são utilizáveis: vistas que a app usa
    for (const v of ['stock_current', 'accessory_stock', 'intervention_stock_moves']) {
      try { await sql.unsafe(`select count(*) from gestao_interv.${v}`) } catch (e) { problems.push(`A vista ${v} não responde nos dados repostos: ${(e as Error).message}`) }
    }
    restoredInterv = ((await sql`select count(*)::int as n from gestao_interv.interventions`) as unknown as { n: number }[])[0].n
    if (!restoredInterv) problems.push('A cópia reposta não tem intervenções — suspeito.')
    const [{ n: liveInterv }] = await live<{ n: number }[]>`select count(*)::int as n from interventions`
    if (Math.abs(liveInterv - restoredInterv) > Math.max(50, liveInterv * 0.02)) problems.push(`Intervenções: ${restoredInterv} na cópia vs ${liveInterv} na base em uso — diferença grande.`)
  } finally {
    // 6) deixa a base temporária vazia (não guarda dados de clientes num 2.º sítio)
    await sql`drop schema if exists gestao_interv cascade`.catch(() => {})
    await sql.end({ timeout: 5 }).catch(() => {})
  }
  const result = { file: backup.name, mb: backup.mb, rows: Object.values(counts).reduce((a, b) => a + b, 0), tables: tables.length, interventions: restoredInterv, seconds: Math.round((Date.now() - t0) / 1000) }
  if (problems.length) throw new Error(problems.join(' | '))
  return result
}
