import { timingSafeEqual } from 'crypto'
import { runRestoreTest } from '@/lib/restore-test'

import { runJob } from '@/lib/jobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 600

/**
 * Tarefa automática: teste mensal de reposição da cópia de segurança (Google Drive → base temporária).
 * Protegida pela variável CRON_SECRET (cabeçalho "Authorization: Bearer <CRON_SECRET>").
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? ''
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(got), b = Buffer.from(secret)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return new Response('Sem permissão', { status: 401 })
  try {
    return Response.json(await runJob('restore-test', runRestoreTest))
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
