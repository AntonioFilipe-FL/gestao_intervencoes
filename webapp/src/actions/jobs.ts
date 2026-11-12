'use server'

import { getCurrentUser } from '@/lib/auth'
import { getJobProblems, type JobProblem } from '@/lib/jobs'

/** Problemas nas tarefas automáticas (só super admin; outros recebem lista vazia) */
export async function getJobProblemsNotice(): Promise<JobProblem[]> {
  const user = await getCurrentUser()
  if (!user?.superadmin) return []
  return getJobProblems().catch(() => [])
}

/** Faz agora a cópia de segurança para o Google Drive (só super admin) */
export async function runBackupNow() {
  try {
    const user = await getCurrentUser()
    if (!user?.superadmin) throw new Error('Sem permissões: apenas o super admin.')
    const { backupToDrive } = await import('@/lib/backup')
    const { runJob } = await import('@/lib/jobs')
    const r = await runJob('db-backup', backupToDrive)
    return { ok: true as const, ...r }
  } catch (e) { return { ok: false as const, error: (e as Error).message } }
}

/** Testa agora a reposição da cópia mais recente do Drive numa base temporária (só super admin) */
export async function runRestoreTestNow() {
  try {
    const user = await getCurrentUser()
    if (!user?.superadmin) throw new Error('Sem permissões: apenas o super admin.')
    const { runRestoreTest } = await import('@/lib/restore-test')
    const { runJob } = await import('@/lib/jobs')
    const r = await runJob('restore-test', runRestoreTest)
    return { ok: true as const, ...r }
  } catch (e) { return { ok: false as const, error: (e as Error).message } }
}
