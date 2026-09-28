'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteMovement } from '@/actions/stock'

/** Anular uma receção/transferência registada por engano */
export function MovementDelete({ id }: { id: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy}
      title="Anular este movimento"
      onClick={() => {
        if (!confirm('Anular este movimento? O IMEI volta à posição anterior.')) return
        start(async () => {
          const r = await deleteMovement(id)
          if (!r.ok) alert(r.error)
          router.refresh()
        })
      }}
    >
      <Undo2 /> Anular
    </Button>
  )
}
