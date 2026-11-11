/**
 * Repõe uma cópia de segurança (ficheiro .json.gz do "npm run db:backup" ou do Google Drive) numa base de dados.
 *
 * SEGURANÇA: só escreve na base de dados indicada em RESTORE_DATABASE_URL (nunca na DATABASE_URL), e só com --confirm.
 * A base de dados de destino tem de ter o esquema criado (db/schema.sql). As tabelas do esquema gestao_interv são
 * ESVAZIADAS e preenchidas com os dados da cópia.
 *
 *   npx tsx scripts/restore-db.ts <ficheiro.json.gz>             → só mostra o que a cópia tem (não altera nada)
 *   npx tsx scripts/restore-db.ts <ficheiro.json.gz> --confirm   → repõe em RESTORE_DATABASE_URL
 */
import fs from 'fs'
import zlib from 'zlib'
import readline from 'readline'
import dotenv from 'dotenv'
import postgres from 'postgres'

dotenv.config({ path: '.env.local' })
const file = process.argv[2]
const CONFIRM = process.argv.includes('--confirm')

async function lines(fn: (o: Record<string, unknown>) => Promise<void>) {
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity })
  for await (const line of rl) if (line) await fn(JSON.parse(line))
}

async function main() {
  if (!file || !fs.existsSync(file)) throw new Error('Uso: npx tsx scripts/restore-db.ts <ficheiro.json.gz> [--confirm]')
  // 1) lê o resumo
  let head: { at?: string; tables?: string[] } = {}, counts: Record<string, number> | null = null
  const seen: Record<string, number> = {}
  await lines(async (o) => {
    if (o.backup) head = o as typeof head
    else if (o.end) counts = o.counts as Record<string, number>
    else seen[o.table as string] = (seen[o.table as string] ?? 0) + 1
  })
  if (!counts) throw new Error('A cópia está incompleta (não tem a linha final) — não é segura para repor.')
  const total = Object.values(seen).reduce((a, b) => a + b, 0)
  console.log(`Cópia de ${head.at}: ${total} registos em ${head.tables?.length ?? 0} tabelas.`)
  for (const [t, n] of Object.entries(counts as Record<string, number>)) if ((seen[t] ?? 0) !== n) throw new Error(`Tabela ${t}: a cópia diz ${n} registos mas tem ${seen[t] ?? 0}.`)
  if (!CONFIRM) { console.log('Cópia íntegra. Nada foi alterado. Para repor: defina RESTORE_DATABASE_URL e acrescente --confirm'); return }

  const url = process.env.RESTORE_DATABASE_URL
  if (!url) throw new Error('Defina RESTORE_DATABASE_URL (a base de dados de DESTINO). Por segurança, este script nunca usa a DATABASE_URL.')
  if (url === process.env.DATABASE_URL) throw new Error('RESTORE_DATABASE_URL é igual à DATABASE_URL (a base de dados em uso). Reponha primeiro numa base de dados nova.')
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const existing = new Set((await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'gestao_interv' and table_type = 'BASE TABLE'`).map((t) => t.table_name))
    const missing = (head.tables ?? []).filter((t) => !existing.has(t))
    if (missing.length) throw new Error(`Faltam tabelas no destino (aplique primeiro o db/schema.sql): ${missing.join(', ')}`)
    await sql.begin(async (tx) => {
      // sem verificação de chaves estrangeiras durante a carga (a ordem das tabelas deixa de importar)
      await tx`set local session_replication_role = replica`
      for (const t of head.tables ?? []) await tx`truncate table ${tx('gestao_interv')}.${tx(t)} cascade`
      let batch: unknown[] = [], cur = ''
      const flush = async () => {
        if (!batch.length) return
        // jsonb_populate_recordset converte cada campo para o tipo da coluna (datas, jsonb, listas…)
        await tx.unsafe(`insert into gestao_interv."${cur}" select * from jsonb_populate_recordset(null::gestao_interv."${cur}", $1::text::jsonb)`, [JSON.stringify(batch)])
        batch = []
      }
      await lines(async (o) => {
        if (!o.table) return
        if (o.table !== cur) { await flush(); cur = o.table as string }
        batch.push(o.row)
        if (batch.length >= 1000) await flush()
      })
      await flush()
      // acerta os contadores automáticos (colunas serial) com o maior valor carregado
      const seqs = await tx<{ t: string; c: string; s: string }[]>`
        select c.table_name as t, c.column_name as c, pg_get_serial_sequence('gestao_interv.' || quote_ident(c.table_name), c.column_name) as s
        from information_schema.columns c where c.table_schema = 'gestao_interv' and c.column_default like 'nextval(%'`
      for (const q of seqs) if (q.s) await tx.unsafe(`select setval('${q.s}', greatest((select coalesce(max("${q.c}"), 0) from gestao_interv."${q.t}"), 1))`)
    })
    // confirma as contagens
    let bad = 0
    for (const [t, n] of Object.entries(counts as Record<string, number>)) {
      const [{ c }] = await sql.unsafe(`select count(*)::int as c from gestao_interv."${t}"`) as unknown as { c: number }[]
      if (c !== n) { bad++; console.log(`  ✘ ${t}: esperado ${n}, ficou ${c}`) }
    }
    console.log(bad ? `\nReposição com ${bad} tabela(s) diferente(s).` : `\nReposição concluída: ${total} registos, todas as tabelas conferem.`)
    if (bad) process.exitCode = 1
  } finally { await sql.end() }
}
main().catch((e) => { console.error('FALHOU:', e.message); process.exit(1) })
