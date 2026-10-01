'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setBillingEmailEnabled } from '@/actions/email-settings'

export function BillingEmailToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const toggle = () =>
    start(async () => {
      if (enabled && !confirm('Desligar o envio? Os registos com Faturar = Sim deixam de gerar email até voltar a ligar.')) return
      const r = await setBillingEmailEnabled(!enabled)
      if (!r.ok) alert(r.error)
      router.refresh()
    })
  return (
    <Button size="lg" variant={enabled ? 'inverse' : 'default'} disabled={busy} onClick={toggle}>
      {busy ? 'A gravar…' : enabled ? 'Desligar envio (OFF)' : 'Ligar envio (ON)'}
    </Button>
  )
}
