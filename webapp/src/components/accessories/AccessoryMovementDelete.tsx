'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteAccessoryMovement } from '@/actions/accessory-stock'

export function AccessoryMovementDelete({ id }: { id: string }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  return (
    <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
      if (!confirm('Anular este movimento?')) return
      start(async () => { const r = await deleteAccessoryMovement(id); if (!r.ok) alert(r.error); router.refresh() })
    }}><Undo2 /> Anular</Button>
  )
}
