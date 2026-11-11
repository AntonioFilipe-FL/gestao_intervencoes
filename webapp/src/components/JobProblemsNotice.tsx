'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useNoticeTurn } from '@/lib/notice-queue'
import { getJobProblemsNotice } from '@/actions/jobs'
import type { JobProblem } from '@/lib/jobs'

const KEY = 'job-problems-seen'

/** Pop-up do super admin (uma vez por sessão do browser): tarefas automáticas que falharam ou deixaram de correr */
export function JobProblemsNotice() {
  const [rows, setRows] = useState<JobProblem[] | null>(null)
  useEffect(() => {
    try { if (sessionStorage.getItem(KEY)) return } catch { /* sem sessionStorage: mostra */ }
    getJobProblemsNotice().then((r) => r.length && setRows(r)).catch(() => {})
  }, [])
  const turn = useNoticeTurn('job-problems', !!rows)
  if (!rows || !turn) return null
  const close = () => { try { sessionStorage.setItem(KEY, '1') } catch { /* ignora */ } setRows(null) }
  return (
    <Dialog open disablePointerDismissal onOpenChange={(o, d) => !o && d.reason !== 'escape-key' && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle><AlertTriangle className="mr-2 inline size-5 align-[-4px] text-[#d0312d]" />Tarefas automáticas com problema</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {rows.map((r) => (
            <div key={r.name} className="border border-fc-dark-20 px-3 py-2">
              <p className="font-semibold">{r.label}</p>
              <p className="text-[#b31d25]">{r.problem}</p>
              {r.at && <p className="fc-small text-fc-dark-60">Última execução: {new Date(r.at).toLocaleString('pt-PT', { timeZone: 'Europe/Lisbon', dateStyle: 'short', timeStyle: 'short' })}</p>}
            </div>
          ))}
          <p className="fc-small text-fc-dark-60">As tarefas correm no Railway (serviços de cron). Veja os logs do serviço respetivo.</p>
        </div>
        <DialogFooter>
          <Button onClick={close}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
