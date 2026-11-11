'use server'

import { getCurrentUser } from '@/lib/auth'
import { getJobProblems, type JobProblem } from '@/lib/jobs'

/** Problemas nas tarefas automáticas (só super admin; outros recebem lista vazia) */
export async function getJobProblemsNotice(): Promise<JobProblem[]> {
  const user = await getCurrentUser()
  if (!user?.superadmin) return []
  return getJobProblems().catch(() => [])
}
