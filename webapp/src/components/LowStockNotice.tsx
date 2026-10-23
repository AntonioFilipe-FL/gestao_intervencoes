'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getLowStockNotice, markLowStockSeen, type LowStock } from '@/actions/low-stock'

/** Pop-up para admins (uma vez por dia): equipamentos abaixo do stock mínimo por armazém/técnico */
export function LowStockNotice() {
  const [info, setInfo] = useState<{ today: string; list: LowStock[] } | null>(null)
  // espera um pouco para não abrir em cima do aviso de material recebido
  useEffect(() => { const t = setTimeout(() => getLowStockNotice().then((r) => r && setInfo(r)).catch(() => {}), 1500); return () => clearTimeout(t) }, [])
  if (!info) return null
  const close = () => { void markLowStockSeen(info.today); setInfo(null) }
  const byWh = new Map<string, LowStock[]>()
  for (const l of info.list) byWh.set(l.warehouse, [...(byWh.get(l.warehouse) ?? []), l])
  const reds = info.list.filter((l) => l.level === 'red').length
  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle><AlertTriangle className="mr-2 inline size-5 align-[-4px] text-[#d0312d]" />Stock abaixo do mínimo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p>
            <b>{reds}</b> abaixo ou no mínimo <span className="text-[#d0312d]">●</span>
            {info.list.length - reds > 0 && <> · <b>{info.list.length - reds}</b> perto do mínimo <span className="text-[#f2b600]">●</span></>}
          </p>
          <div className="max-h-[50vh] space-y-2 overflow-y-auto">
            {[...byWh].map(([wh, items]) => (
              <div key={wh} className="border border-fc-dark-20">
                <p className="bg-fc-grey-80 px-3 py-1 font-semibold">{wh}</p>
                <ul>
                  {items.map((l) => (
                    <li key={l.equipment} className="flex items-center justify-between border-t border-fc-dark-10 px-3 py-1">
                      <span><span className={l.level === 'red' ? 'text-[#d0312d]' : 'text-[#f2b600]'}>● </span>{l.equipment}</span>
                      <span className="tabular-nums"><b>{l.qty}</b> <span className="text-fc-dark-60">/ mín. {l.min}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="fc-small text-fc-dark-60">Este aviso aparece uma vez por dia. Os mínimos definem-se no Stock › Stock mínimo.</p>
        </div>
        <DialogFooter>
          <Button variant="inverse" onClick={close}>OK</Button>
          <Link href="/stock" onClick={close} className={buttonVariants()}>Ver no Stock</Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
