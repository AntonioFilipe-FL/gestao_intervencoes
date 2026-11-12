import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import postgres from 'postgres'
import { SignJWT } from 'jose'

dotenv.config({ path: '.env.local' })
export const STATE_FILE = path.join(__dirname, '.auth', 'state.json')

/**
 * Cria a sessão dos testes: um cookie `gi_session` assinado com o AUTH_SECRET (igual ao de src/lib/session.ts),
 * para um utilizador que já existe em profiles (E2E_EMAIL, ou o primeiro super admin). Só lê da base de dados.
 */
export default async function globalSetup() {
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < 32) throw new Error('AUTH_SECRET em falta no .env.local (mínimo 32 caracteres).')
  let email = process.env.E2E_EMAIL?.toLowerCase()
  if (!email) {
    if (!process.env.DATABASE_URL) throw new Error('Defina E2E_EMAIL ou DATABASE_URL no .env.local.')
    const sql = postgres(process.env.DATABASE_URL, { max: 1, connection: { search_path: 'gestao_interv,public' } })
    try {
      const [p] = await sql<{ email: string }[]>`select email from profiles where is_superadmin order by email limit 1`
      email = p?.email
    } finally { await sql.end() }
  }
  if (!email) throw new Error('Não há nenhum super admin em profiles. Defina E2E_EMAIL com um email de profiles.')

  const token = await new SignJWT({ email, name: 'Teste E2E' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('2h').sign(new TextEncoder().encode(secret))
  const url = new URL(process.env.E2E_BASE_URL ?? `http://localhost:${process.env.E2E_PORT ?? 3100}`)
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify({
    cookies: [{ name: 'gi_session', value: token, domain: url.hostname, path: '/', httpOnly: true, secure: url.protocol === 'https:', sameSite: 'Lax', expires: Math.floor(Date.now() / 1000) + 7200 }],
    origins: [],
  }))
}
