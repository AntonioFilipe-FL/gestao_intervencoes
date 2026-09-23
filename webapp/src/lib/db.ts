import 'server-only'
import postgres from 'postgres'

/**
 * Ligação única ao PostgreSQL (Railway).
 * DATABASE_URL: no Railway usar a referência ${{Postgres.DATABASE_URL}} (rede privada);
 * em desenvolvimento local usar o DATABASE_PUBLIC_URL do serviço Postgres.
 */
const globalForDb = globalThis as unknown as { sql?: postgres.Sql }

export const sql =
  globalForDb.sql ??
  postgres(process.env.DATABASE_URL!, {
    max: 10,
    idle_timeout: 30,
    connection: { search_path: 'gestao_interv,public' },
    // datas (tipo date) chegam como string 'YYYY-MM-DD' em vez de Date com fuso horário
    types: { date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x } },
  })

if (process.env.NODE_ENV !== 'production') globalForDb.sql = sql
