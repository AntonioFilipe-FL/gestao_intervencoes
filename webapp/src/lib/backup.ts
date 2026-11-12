import 'server-only'
import zlib from 'zlib'
import { sql } from '@/lib/db'
import { decryptSecret } from '@/lib/crypto'

/** Cópias de segurança diárias para o Google Drive do super admin (pasta própria; a app só vê os ficheiros que criou). */
const FOLDER_NAME = 'Backup_Gestao_Interv'
const KEEP = 30
export const DRIVE = 'https://www.googleapis.com/drive/v3'

export async function getBackupStatus() {
  const rows = await sql<{ key: string; value: string | null; updated_at: Date }[]>`
    select key, value, updated_at from app_settings where key in ('backup_drive_email', 'backup_drive_token', 'job:db-backup')`
  const get = (k: string) => rows.find((r) => r.key === k)
  let last: { at: string; ok: boolean; error?: string; result?: { file?: string; mb?: number; rows?: number } } | null = null
  try { last = JSON.parse(get('job:db-backup')?.value ?? 'null') } catch { /* ignora */ }
  return { connected: !!get('backup_drive_token')?.value, email: get('backup_drive_email')?.value ?? null, last }
}

export async function driveToken() {
  const [t] = await sql<{ value: string | null }[]>`select value from app_settings where key = 'backup_drive_token'`
  if (!t?.value) throw new Error('O Google Drive das cópias de segurança ainda não foi ligado (Configurações → Super admin).')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, cache: 'no-store',
    body: new URLSearchParams({ client_id: process.env.AUTH_GOOGLE_ID!, client_secret: process.env.AUTH_GOOGLE_SECRET!, refresh_token: decryptSecret(t.value), grant_type: 'refresh_token' }),
  })
  if (!res.ok) {
    const body = await res.text()
    if (body.includes('invalid_grant')) throw new Error('A autorização do Google Drive expirou. Volte a ligá-lo em Configurações → Super admin.')
    throw new Error(`Google token: ${res.status} ${body.slice(0, 200)}`)
  }
  return ((await res.json()) as { access_token: string }).access_token
}

/** Todas as tabelas do esquema gestao_interv, uma linha JSON por registo, comprimido (mesmo formato do npm run db:backup) */
async function dumpDatabase() {
  const chunks: Buffer[] = []
  const gz = zlib.createGzip({ level: 6 })
  gz.on('data', (c: Buffer) => chunks.push(c))
  const done = new Promise<void>((res, rej) => { gz.on('end', () => res()); gz.on('error', rej) })
  const write = (o: unknown) => new Promise<void>((res) => { if (gz.write(JSON.stringify(o) + '\n')) res(); else gz.once('drain', () => res()) })
  const tables = (await sql<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'gestao_interv' and table_type = 'BASE TABLE' order by 1`).map((t) => t.table_name)
  await write({ backup: 'gestao_interv', at: new Date().toISOString(), tables })
  const counts: Record<string, number> = {}
  for (const t of tables) {
    let n = 0
    // to_jsonb no Postgres: valores exatos (datas com microssegundos), para a reposição ficar igual ao original
    // iterador do cursor (sequencial): a contagem só fica feita depois de todas as linhas escritas
    for await (const rows of sql<{ row: unknown }[]>`select to_jsonb(x) as row from ${sql('gestao_interv')}.${sql(t)} x`.cursor(2000)) {
      for (const r of rows) { await write({ table: t, row: r.row }); n++ }
    }
    counts[t] = n
  }
  await write({ end: true, counts })
  gz.end()
  await done
  return { data: Buffer.concat(chunks), rows: Object.values(counts).reduce((a, b) => a + b, 0), tables: tables.length }
}

export async function driveJson(token: string, url: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } })
  const text = await r.text()
  if (!r.ok) throw new Error(`Google Drive: HTTP ${r.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : {}
}

/** Pasta das cópias no Drive (criada na primeira vez; recriada se tiver sido apagada) */
export async function backupFolder(token: string) {
  const [f] = await sql<{ value: string | null }[]>`select value from app_settings where key = 'backup_drive_folder'`
  if (f?.value) {
    const ok = await driveJson(token, `${DRIVE}/files/${f.value}?fields=id,trashed`).then((x) => x.id && !x.trashed).catch(() => false)
    if (ok) return f.value
  }
  const created = await driveJson(token, `${DRIVE}/files?fields=id`, { method: 'POST', body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }) })
  await sql`insert into app_settings (key, value, updated_by) values ('backup_drive_folder', ${created.id}, 'sistema')
            on conflict (key) do update set value = excluded.value, updated_at = now()`
  return created.id as string
}

/** Faz a cópia e envia-a para o Google Drive; fica com as KEEP mais recentes (as antigas vão para o lixo do Drive). */
export async function backupToDrive() {
  const token = await driveToken()
  const { data, rows, tables } = await dumpDatabase()
  const folder = await backupFolder(token)
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon' }).replace(' ', '_').replace(/:/g, '').slice(0, 15)
  const name = `gestao_interv_${stamp}.json.gz`
  // envio "resumable": 1) cria a sessão com os metadados  2) envia o conteúdo
  const start = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/gzip', 'X-Upload-Content-Length': String(data.length) },
    body: JSON.stringify({ name, parents: [folder] }),
  })
  const location = start.headers.get('location')
  if (!start.ok || !location) throw new Error(`Google Drive (início do envio): HTTP ${start.status} ${(await start.text()).slice(0, 200)}`)
  const up = await fetch(location, { method: 'PUT', cache: 'no-store', headers: { 'Content-Type': 'application/gzip', 'Content-Length': String(data.length) }, body: new Uint8Array(data) })
  if (!up.ok) throw new Error(`Google Drive (envio): HTTP ${up.status} ${(await up.text()).slice(0, 200)}`)
  // retenção: as mais antigas vão para o lixo do Drive (recuperáveis durante 30 dias)
  const list = await driveJson(token, `${DRIVE}/files?q=${encodeURIComponent(`'${folder}' in parents and trashed = false`)}&fields=files(id,name)&pageSize=200`)
  const old = ((list.files ?? []) as { id: string; name: string }[]).filter((f) => /^gestao_interv_.*\.json\.gz$/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name)).slice(KEEP)
  for (const f of old) await driveJson(token, `${DRIVE}/files/${f.id}`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) }).catch(() => {})
  return { file: name, mb: Math.round((data.length / 1048576) * 10) / 10, rows, tables, removed: old.length }
}
