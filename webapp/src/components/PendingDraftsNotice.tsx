'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useNoticeTurn } from '@/lib/notice-queue'
import { getPendingDrafts, type DraftRow } from '@/actions/drafts'

const KEY = 'drafts-notice-seen'
const fmtDate = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

/** Pop-up para admin / super admin, a cada login (uma vez por sessão do browser): intervenções por confirmar */
export function PendingDraftsNotice() {
  const [rows, setRows] = useState<DraftRow[] | null>(null)
  useEffect(() => {
    try { if (sessionStorage.getItem(KEY)) return } catch { /* sem sessionStorage: mostra */ }
    getPendingDrafts().then((r) => r.length && setRows(r)).catch(() => {})
  }, [])
  const turn = useNoticeTurn('drafts', !!rows)
  if (!rows || !turn) return null
  const close = () => { try { sessionStorage.setItem(KEY, '1') } catch { /* ignora */ } setRows(null) }
  return (
    <Dialog open disablePointerDismissal onOpenChange={(o, d) => !o && d.reason !== 'escape-key' && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle><ClipboardList className="mr-2 inline size-5 align-[-4px]" />Intervenções por confirmar</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p>Há <b>{rows.length}</b> formulário(s) do Creator à espera de revisão. Só entram nas intervenções e no stock depois de rever e gravar.</p>
          <div className="max-h-[50vh] overflow-y-auto border border-fc-dark-20">
            {rows.map((r) => (
              <Link key={r.id} href={`/interventions/new?draft=${r.id}`} onClick={close}
                className="flex flex-wrap items-center gap-x-3 border-t border-fc-dark-10 px-3 py-1.5 first:border-t-0 hover:bg-fc-grey-80">
                <b className="w-20">{fmtDate(r.intervention_date)}</b>
                <span className="w-28 text-fc-dark-60">{r.form_type ?? '—'}</span>
                <span className="min-w-40 flex-1">{r.client_name ?? '—'}</span>
                <span className="font-mono">{r.license_plate ?? ''}</span>
                <span className="w-10 text-right text-fc-dark-60">{r.technician_name ?? ''}</span>
              </Link>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="inverse" onClick={close}>Mais tarde</Button>
          <Link href="/interventions/drafts" onClick={close} className={buttonVariants()}>Ver todas</Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
