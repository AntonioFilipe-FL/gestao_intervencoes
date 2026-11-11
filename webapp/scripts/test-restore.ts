/**
 * Teste de reposição: prova que uma cópia de segurança se consegue repor numa base de dados TEMPORÁRIA e que os dados
 * ficam utilizáveis. Pensado para correr todos os meses (um backup nunca restaurado não dá garantias).
 *
 *   npm run test:restore                       → usa a cópia mais recente da pasta backups/ (ou BACKUP_DIR)
 *   npm run test:restore -- <ficheiro.json.gz> → usa esse ficheiro (ex.: descarregado do Google Drive)
 *   npm run test:restore -- --fresh            → faz primeiro uma cópia nova da base de dados em uso (só leitura)
 *   npm run test:restore -- --record           → regista o resultado na app (job:restore-test; aviso ao super admin se falhar)
 *
 * Requer RESTORE_DATABASE_URL: uma base de dados VAZIA e descartável (nunca a DATABASE_URL — o script recusa).
 * O esquema (db/schema.sql) é aplicado no destino, a cópia é reposta com o restore-db e depois verifica-se:
 *   1. todas as tabelas conferem com a cópia; 2. as vistas de stock respondem; 3. as contagens batem certo com a base em uso
 *   (diferenças pequenas são normais, a base em uso muda); 4. a cópia não é antiga (≤ 3 dias; ignorado com ficheiro indicado).
 */
import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '.env.local' })
const args = process.argv.slice(2)
const FRESH = args.includes('--fresh'), RECORD = args.includes('--record')
const fileArg = args.find((a) => !a.startsWith('--'))
const root = path.join(__dirname, '..')
const tsx = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx')

const problems: string[] = []
const info: string[] = []
const log = (s: string) => { console.log(s); info.push(s) }

function run(script: string, scriptArgs: string[], env: Record<string, string | undefined> = {}) {
  const r = spawnSync(tsx, [path.join('scripts', script), ...scriptArgs], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', shell: process.platform === 'win32' })
  if (r.stdout) process.stdout.write(r.stdout)
  if (r.stderr) process.stderr.write(r.stderr)
  if (r.status !== 0) throw new Error(`${script} falhou (código ${r.status}). ${(r.stderr || r.stdout || '').trim().split('\n').slice(-2).join(' ')}`)
  return r.stdout
}

const sameDb = (a: string, b: string) => {
  try { const x = new URL(a), y = new URL(b); return x.host === y.host && x.pathname === y.pathname } catch { return a === b }
}

async function main() {
  const live = process.env.DATABASE_URL, dest = process.env.RESTORE_DATABASE_URL
  if (!dest) throw new Error('Defina RESTORE_DATABASE_URL (base de dados vazia e descartável, p.ex. um Postgres temporário).')
  if (live && sameDb(live, dest)) throw new Error('RESTORE_DATABASE_URL aponta para a mesma base de dados que a DATABASE_URL — recusado.')

  // 1) ficheiro da cópia
  let file = fileArg ? path.resolve(fileArg) : ''
  let tmpDir = ''
  if (FRESH) {
    if (!live) throw new Error('DATABASE_URL não definido (.env.local)')
    tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'restore-test-'))
    log('A fazer uma cópia nova da base de dados em uso…')
    run('backup-db.ts', ['--keep', '1000'], { BACKUP_DIR: tmpDir })
    file = path.join(tmpDir, fs.readdirSync(tmpDir).filter((f) => f.endsWith('.json.gz')).sort().pop()!)
  } else if (!file) {
    const dir = process.env.BACKUP_DIR || path.join(root, 'backups')
    const last = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^gestao_interv_.*\.json\.gz$/.test(f)).sort().pop() : undefined
    if (!last) throw new Error(`Não há cópias em ${dir}. Use --fresh, indique um ficheiro, ou faça npm run db:backup.`)
    file = path.join(dir, last)
    const ageDays = (Date.now() - fs.statSync(file).mtimeMs) / 86400000
    if (ageDays > 3) problems.push(`A cópia mais recente (${last}) tem ${Math.floor(ageDays)} dias — as cópias automáticas podem ter deixado de correr.`)
  }
  if (!fs.existsSync(file)) throw new Error(`Ficheiro não encontrado: ${file}`)
  log(`Cópia a testar: ${path.basename(file)} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB)`)

  const t0 = Date.now()
  const sql = postgres(dest, { max: 1, onnotice: () => {} })
  try {
    // 2) esquema no destino (idempotente)
    log('A aplicar o esquema no destino…')
    await sql.unsafe(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'))

    // 3) reposição (o restore-db confere as contagens de todas as tabelas; falha se alguma não bater)
    log('A repor a cópia…')
    const out = run('restore-db.ts', [file, '--confirm'], { RESTORE_DATABASE_URL: dest })
    if (!/todas as tabelas conferem/.test(out)) problems.push('A reposição não confirmou todas as tabelas.')

    // 4) os dados repostos têm de ser utilizáveis: vistas/funções que a app usa
    for (const q of ['select count(*) from gestao_interv.stock_current', 'select count(*) from gestao_interv.accessory_stock', 'select count(*) from gestao_interv.intervention_stock_moves']) {
      try { await sql.unsafe(q) } catch (e) { problems.push(`${q.replace('select count(*) from ', '')} não responde no destino: ${(e as Error).message}`) }
    }
    const [{ n: restoredInterv }] = await sql<{ n: number }[]>`select count(*)::int as n from gestao_interv.interventions`
    const [{ n: restoredStock }] = await sql<{ n: number }[]>`select count(*)::int as n from gestao_interv.stock_current`
    log(`Destino: ${restoredInterv} intervenções, ${restoredStock} IMEIs com stock registado.`)
    if (restoredInterv === 0) problems.push('A cópia reposta não tem intervenções — suspeito.')

    // 5) comparação com a base em uso (tolerância: ela vai mudando entre a cópia e agora)
    if (live) {
      const lsql = postgres(live, { max: 1, onnotice: () => {} })
      try {
        const [{ n: liveInterv }] = await lsql<{ n: number }[]>`select count(*)::int as n from gestao_interv.interventions`
        const diff = Math.abs(liveInterv - restoredInterv)
        log(`Base em uso: ${liveInterv} intervenções (diferença ${diff}).`)
        if (diff > Math.max(20, liveInterv * (FRESH ? 0.005 : 0.1))) problems.push(`Nº de intervenções muito diferente da base em uso (${restoredInterv} vs ${liveInterv}).`)
      } finally { await lsql.end() }
    }
  } finally { await sql.end(); if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }) }
  log(`Duração: ${Math.round((Date.now() - t0) / 1000)} s`)
}

async function record(ok: boolean, error?: string) {
  if (!RECORD || !process.env.DATABASE_URL) return
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
  try {
    const state = JSON.stringify({ at: new Date().toISOString(), ok, ...(error ? { error: error.slice(0, 300) } : { result: { notes: info.slice(0, 4) } }) })
    await sql`insert into gestao_interv.app_settings (key, value, updated_by) values ('job:restore-test', ${state}, 'teste-restauro')
              on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`
  } finally { await sql.end() }
}

main()
  .then(async () => {
    const ok = problems.length === 0
    if (ok) console.log('\n✔ Teste de restauro OK: a cópia repõe-se e os dados ficam utilizáveis.')
    else { console.log('\n✘ Teste de restauro com problemas:'); problems.forEach((p) => console.log('  - ' + p)) }
    await record(ok, ok ? undefined : problems.join(' | '))
    process.exit(ok ? 0 : 1)
  })
  .catch(async (e) => { console.error('\n✘ FALHOU o teste de restauro:', e.message); await record(false, e.message).catch(() => {}); process.exit(2) })
