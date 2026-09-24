'use client'

import { useState, useTransition } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { resendBillingEmail } from '@/actions/interventions'

const fmt = (d: string | Date) =>
  new Date(d).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Lisbon' })

/** Estado do email automático à financeira + botão de (re)envio para admins */
export function BillingEmailStatus({
  id,
  notifiedAt,
  notifiedBy,
  error,
  canSend,
}: {
  id: string
  notifiedAt: string | Date | null
  notifiedBy: string | null
  error: string | null
  canSend: boolean
}) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  const send = () =>
    start(async () => {
      const r = await resendBillingEmail(id)
      setMsg(r.ok ? 'Email enviado à financeira.' : `Não foi possível enviar: ${r.error}`)
    })

  return (
    <div className="space-y-2">
      <p className="fc-label">Email à financeira</p>
      {notifiedAt ? (
        <p className="bg-fc-success/20 px-3 py-2 text-[13px] text-[#4b850d]">
          Enviado em {fmt(notifiedAt)}{notifiedBy ? ` por ${notifiedBy}` : ''}
        </p>
      ) : error ? (
        <p className="bg-fc-danger/20 px-3 py-2 text-[13px] text-[#b31d25]">Falhou: {error}</p>
      ) : (
        <p className="text-fc-dark-60">Não enviado</p>
      )}
      {canSend && (
        <Button type="button" variant={notifiedAt ? 'inverse' : 'default'} size="sm" onClick={send} disabled={pending}>
          <Send /> {pending ? 'A enviar…' : notifiedAt ? 'Reenviar' : 'Enviar agora'}
        </Button>
      )}
      {msg && <p className="fc-small text-fc-dark-60">{msg}</p>}
    </div>
  )
}
