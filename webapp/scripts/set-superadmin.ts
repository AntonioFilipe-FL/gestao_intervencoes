/**
 * Ativa/desativa o perfil super admin de um utilizador (só por script — não aparece na gestão de utilizadores).
 *   npx tsx scripts/set-superadmin.ts --email antonio.filipe@pt.frotcom.com
 *   npx tsx scripts/set-superadmin.ts --email ... --off
 */
import dotenv from 'dotenv'
import postgres from 'postgres'
dotenv.config({ path: '.env.local' })
const argv = process.argv.slice(2)
const i = argv.indexOf('--email')
const EMAIL = i >= 0 ? argv[i + 1]?.trim().toLowerCase() : ''
const OFF = argv.includes('--off')
if (!EMAIL) { console.error('Uso: --email <email> [--off]'); process.exit(1) }
const sql = postgres(process.env.DATABASE_URL!, { onnotice: () => {}, connection: { search_path: 'gestao_interv' } })
async function main() {
  const r = await sql`update profiles set is_superadmin = ${!OFF} where email = ${EMAIL} returning email, role`
  if (!r.length) throw new Error(`O email ${EMAIL} não existe em Configurações › Utilizadores.`)
  const all = await sql<{ email: string }[]>`select email from profiles where is_superadmin order by email`
  console.log(`${EMAIL}: super admin ${OFF ? 'DESATIVADO' : 'ATIVO'}`)
  console.log(`Super admins atuais: ${all.map((a) => a.email).join(', ') || 'nenhum'}`)
  await sql.end()
}
main().catch(async (e) => { console.error('FALHOU:', e.message); await sql.end(); process.exit(1) })
