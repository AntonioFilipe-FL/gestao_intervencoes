'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { setBillingEmailEnabled, setSupportEmailEnabled } from '@/actions/email-settings'

/** kind='support': envio ao suporte (Observações Gerais) */
export function BillingEmailToggle({ enabled, kind = 'billing' }: { enabled: boolean; kind?: 'billing' | 'support' }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const toggle = () =>
    start(async () => {
      if (enabled && !confirm(kind === 'support'
        ? 'Desligar o envio ao suporte? Os registos com Enviar ao suporte = Sim deixam de gerar email até voltar a ligar.'
        : 'Desligar o envio? Os registos com Faturar = Sim deixam de gerar email até voltar a ligar.')) return
      const r = kind === 'support' ? await setSupportEmailEnabled(!enabled) : await setBillingEmailEnabled(!enabled)
      if (!r.ok) alert(r.error)
      router.refresh()
    })
  return (
    <Button size="lg" variant={enabled ? 'inverse' : 'default'} disabled={busy} onClick={toggle}>
      {busy ? 'A gravar…' : enabled ? 'Desligar envio (OFF)' : 'Ligar envio (ON)'}
    </Button>
  )
}
