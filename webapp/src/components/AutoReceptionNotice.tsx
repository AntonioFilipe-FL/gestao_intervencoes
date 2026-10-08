'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PackageCheck } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getUnseenAutoReceptions, markAutoReceptionsSeen } from '@/actions/auto-reception'

type Info = { lastId: number; n: number; byEquipment: Record<string, number> }

/** Pop-up: "Foram recebidos X equipamentos e adicionados automaticamente ao stock (A1)" — uma vez por utilizador e lote */
export function AutoReceptionNotice() {
  const [info, setInfo] = useState<Info | null>(null)
  useEffect(() => { getUnseenAutoReceptions().then((r) => r && setInfo(r)).catch(() => {}) }, [])
  if (!info) return null
  const close = () => { void markAutoReceptionsSeen(info.lastId); setInfo(null) }
  const list = Object.entries(info.byEquipment).sort((a, b) => b[1] - a[1])
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle><PackageCheck className="mr-2 inline size-5 align-[-4px]" />Material novo recebido</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p>
            Foram recebidos <b>{info.n.toLocaleString('pt-PT')} equipamento(s)</b> na conta Frotcom Lusitana e adicionados
            automaticamente ao <b>A1 - Stock Frotcom Venda</b>.
          </p>
          <ul className="border border-fc-dark-20">
            {list.map(([name, n]) => (
              <li key={name} className="flex justify-between border-t border-fc-dark-10 px-3 py-1 first:border-t-0">
                <span>{name}</span><b className="tabular-nums">{n}</b>
              </li>
            ))}
          </ul>
          <p className="fc-small text-fc-dark-60">Faça a distribuição pelos armazéns com uma Transferência, no Stock.</p>
        </div>
        <DialogFooter>
          <Button variant="inverse" onClick={close}>OK</Button>
          <Link href="/stock" onClick={close} className={buttonVariants()}>Ver no Stock</Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
