/**
 * Cópia de segurança dos dados da app (só leitura na base de dados): todas as tabelas do esquema gestao_interv
 * para um ficheiro comprimido na pasta backups/ (que NÃO vai para o git).
 *
 *   npm run db:backup                 → backups/gestao_interv_AAAA-MM-DD_HHMM.json.gz
 *   npm run db:backup -- --keep 30    → guarda só as 30 cópias mais recentes (por omissão 30)
 *   BACKUP_DIR=<pasta> no .env.local  → guarda noutra pasta (ex.: sincronizada com a cloud)
 *
 * Formato: uma linha JSON por registo — {"table":"…","row":{…}} — antecedida de uma linha com o resumo.
 * É uma segunda rede de segurança; a principal são as cópias automáticas do Postgres no Railway.
 */
import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '.env.local' })
const keepArg = process.argv.indexOf('--keep')
const KEEP = keepArg > 0 ? Math.max(1, Number(process.argv[keepArg + 1]) || 30) : 30

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definido em .env.local')
  const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
  // BACKUP_DIR (no .env.local): outra pasta para as cópias, ex.: uma pasta sincronizada com o OneDrive / Google Drive
  const dir = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Lisbon' }).replace(' ', '_').replace(/:/g, '').slice(0, 15)
  const file = path.join(dir, `gestao_interv_${stamp}.json.gz`)
  const tmp = file + '.tmp'
  const gz = zlib.createGzip({ level: 6 })
  const out = fs.createWriteStream(tmp)
  gz.pipe(out)
  const write = (o: unknown) => new Promise<void>((res) => { if (gz.write(JSON.stringify(o) + '\n')) res(); else gz.once('drain', () => res()) })
  try {
    const tables = (await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'gestao_interv' and table_type = 'BASE TABLE' order by 1`).map((t) => t.table_name)
    await write({ backup: 'gestao_interv', at: new Date().toISOString(), tables })
    const counts: Record<string, number> = {}
    for (const t of tables) {
      let n = 0
      // to_jsonb no Postgres: valores exatos (datas com microssegundos, números grandes), sem passar por tipos do JavaScript
      // iterador do cursor (sequencial): a contagem só fica feita depois de todas as linhas escritas
      for await (const rows of sql<{ row: unknown }[]>`select to_jsonb(x) as row from ${sql('gestao_interv')}.${sql(t)} x`.cursor(2000)) {
        for (const r of rows) { await write({ table: t, row: r.row }); n++ }
      }
      counts[t] = n
      console.log(`  ${t}: ${n}`)
    }
    await write({ end: true, counts })
    await new Promise<void>((res, rej) => { out.on('finish', () => res()); out.on('error', rej); gz.end() })
    fs.renameSync(tmp, file)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    console.log(`\nCópia guardada: ${file} (${(fs.statSync(file).size / 1048576).toFixed(1)} MB, ${total} registos em ${tables.length} tabelas)`)
    // guarda só as mais recentes
    const old = fs.readdirSync(dir).filter((f) => /^gestao_interv_.*\.json\.gz$/.test(f)).sort().reverse().slice(KEEP)
    for (const f of old) { fs.unlinkSync(path.join(dir, f)); console.log(`Cópia antiga apagada: ${f}`) }
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
    await sql.end()
  }
}
main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
