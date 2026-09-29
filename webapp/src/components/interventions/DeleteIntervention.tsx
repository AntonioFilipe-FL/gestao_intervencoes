'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { deleteIntervention } from '@/actions/interventions'

/** Botão "Eliminar" do detalhe da intervenção (só admin) */
export function DeleteIntervention({ id, label, emailSent }: { id: string; label: string; emailSent: boolean }) {
  const router = useRouter()
  const [busy, start] = useTransition()
  return (
    <Button
      variant="inverse"
      size="lg"
      disabled={busy}
      className="text-fc-danger hover:text-fc-danger"
      onClick={() => {
        const msg =
          `Eliminar a intervenção ${label}?\n\nEsta ação não pode ser desfeita: o registo, os acessórios e os movimentos de stock dele são apagados.` +
          (emailSent ? '\n\nAtenção: o email à financeira deste registo já foi enviado.' : '')
        if (!confirm(msg)) return
        start(async () => {
          const r = await deleteIntervention(id)
          if (!r.success) return alert('Não foi possível eliminar: ' + r.error)
          router.push('/interventions')
          router.refresh()
        })
      }}
    >
      <Trash2 /> {busy ? 'A eliminar…' : 'Eliminar'}
    </Button>
  )
}
