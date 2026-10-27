import { timingSafeEqual } from 'crypto'
import { processFirmwareQueue } from '@/lib/firmware-queue'

export const dynamic = 'force-dynamic'

/**
 * Tarefa automática: envia os pedidos de atualização em espera quando a ignição desliga.
 * Protegida pela variável CRON_SECRET (cabeçalho "Authorization: Bearer <CRON_SECRET>").
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? ''
  const got = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const a = Buffer.from(got), b = Buffer.from(secret)
  if (!secret || a.length !== b.length || !timingSafeEqual(a, b)) return new Response('Sem permissão', { status: 401 })
  try {
    return Response.json(await processFirmwareQueue())
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }
}
