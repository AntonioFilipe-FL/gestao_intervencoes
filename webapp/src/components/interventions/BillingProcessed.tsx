'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setBillingProcessed } from '@/actions/interventions'

/** Marcar/desmarcar "Processado" (financeiro e admin) */
export function BillingProcessed({ id, processedAt, processedBy, canEdit, compact = false }: {
  id: string; processedAt: string | null; processedBy: string | null; canEdit: boolean; compact?: boolean
}) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const run = (v: boolean) =>
    start(async () => {
      const r = await setBillingProcessed(id, v)
      if (!r.ok) alert(r.error)
      router.refresh()
    })
  const when = processedAt ? new Date(processedAt).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : ''

  if (processedAt)
    return (
      <div className={compact ? 'flex items-center gap-1' : 'space-y-2'}>
        <p className="text-[#4b850d]" title={processedBy ?? undefined}>
          <CheckCircle2 className="mr-1 inline size-3.5 align-[-2px]" />
          Processado{compact ? '' : ` em ${when}${processedBy ? ` por ${processedBy}` : ''}`}
        </p>
        {canEdit && (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(false)} title="Voltar a marcar como por processar">
            <Undo2 /> {compact ? '' : 'Desfazer'}
          </Button>
        )}
      </div>
    )
  if (!canEdit) return compact ? <span className="text-fc-dark-60">Por processar</span> : <p className="text-fc-dark-60">Por processar</p>
  return (
    <Button size="sm" disabled={busy} onClick={() => run(true)}>
      <CheckCircle2 /> {busy ? 'A marcar…' : 'Marcar processado'}
    </Button>
  )
}
