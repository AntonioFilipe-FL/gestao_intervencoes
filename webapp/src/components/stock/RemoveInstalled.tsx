'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { removeInstalledFromStock } from '@/actions/stock'

/** "Dar saída" aos IMEIs que a Intranet mostra instalados (um IMEI, ou todos os assinalados do armazém) */
export function RemoveInstalled({ imei, warehouseId, count }: { imei?: string; warehouseId?: string; count?: number }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  const label = imei ? 'Dar saída' : `Dar saída a todos (${count ?? 0})`
  return (
    <Button
      variant={imei ? 'ghost' : 'secondary'}
      size="sm"
      disabled={busy}
      title="Regista uma saída de ajuste: instalado segundo a Intranet"
      onClick={() => {
        const msg = imei
          ? `Dar saída ao IMEI ${imei}? Fica registado como "Instalado segundo a Intranet".`
          : `Dar saída a ${count} IMEI(s) assinalados${warehouseId ? ' deste armazém' : ''}? Ficam registados como "Instalado segundo a Intranet" (pode anular cada um nos movimentos).`
        if (!confirm(msg)) return
        start(async () => {
          const r = await removeInstalledFromStock({ warehouseId, imeis: imei ? [imei] : undefined })
          if (!r.ok) alert(r.error)
          router.refresh()
        })
      }}
    >
      <LogOut /> {busy ? 'A registar…' : label}
    </Button>
  )
}
