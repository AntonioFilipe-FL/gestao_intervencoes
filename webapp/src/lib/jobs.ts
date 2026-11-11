import 'server-only'
import { sql } from '@/lib/db'

/** Tarefas automáticas (cron do Railway) e de quanto em quanto tempo têm de correr, no máximo */
export const JOBS = {
  'creator-import': { label: 'Importação dos formulários do Creator', maxAgeHours: 26 },
  'firmware-queue': { label: 'Envio das atualizações de firmware em espera', maxAgeHours: 2 },
  'db-backup': { label: 'Cópia de segurança diária para o Google Drive', maxAgeHours: 26 },
} as const
export type JobName = keyof typeof JOBS
type JobState = { at: string; ok: boolean; error?: string; result?: unknown }

/** Corre uma tarefa e regista o resultado (app_settings: job:<nome>), para se saber se falhou ou deixou de correr */
export async function runJob<T>(name: JobName, fn: () => Promise<T>): Promise<T> {
  const save = (s: JobState) => sql`
    insert into app_settings (key, value, updated_by) values (${'job:' + name}, ${JSON.stringify(s)}, 'cron')
    on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by`.catch(() => {})
  try {
    const result = await fn()
    await save({ at: new Date().toISOString(), ok: true, result })
    return result
  } catch (e) {
    await save({ at: new Date().toISOString(), ok: false, error: (e as Error).message.slice(0, 300) })
    throw e
  }
}

export type JobProblem = { name: string; label: string; problem: string; at: string | null }

/** Tarefas com problema: última execução com erro, sem correr há demasiado tempo, ou schema que falhou no arranque */
export async function getJobProblems(): Promise<JobProblem[]> {
  const rows = await sql<{ key: string; value: string }[]>`select key, value from app_settings where key like 'job:%' or key = 'schema_last_run'`
  const state = new Map(rows.map((r) => { try { return [r.key, JSON.parse(r.value) as JobState] as const } catch { return [r.key, null] as const } }))
  const out: JobProblem[] = []
  for (const [name, j] of Object.entries(JOBS)) {
    const s = state.get('job:' + name)
    if (!s) { out.push({ name, label: j.label, problem: 'Nunca correu — a tarefa automática ainda não foi criada no Railway (ou não chega à app).', at: null }); continue }
    const ageH = (Date.now() - new Date(s.at).getTime()) / 3600000
    if (!s.ok) out.push({ name, label: j.label, problem: `A última execução deu erro: ${s.error ?? 'erro desconhecido'}`, at: s.at })
    else if (ageH > j.maxAgeHours) out.push({ name, label: j.label, problem: `Não corre há ${ageH >= 48 ? `${Math.floor(ageH / 24)} dias` : `${Math.floor(ageH)} horas`} (devia correr pelo menos de ${j.maxAgeHours} em ${j.maxAgeHours} horas).`, at: s.at })
  }
  const sc = state.get('schema_last_run')
  if (sc && !sc.ok) out.push({ name: 'schema', label: 'Atualização da base de dados no arranque', problem: `Falhou: ${sc.error ?? 'erro desconhecido'} — corra npm run db:schema e veja o erro.`, at: sc.at })
  return out
}
