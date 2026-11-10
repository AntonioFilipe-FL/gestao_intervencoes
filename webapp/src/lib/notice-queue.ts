'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * Fila dos avisos de entrada (pop-ups): só um visível de cada vez.
 * O seguinte só aparece depois de o atual ser fechado; entre os que esperam, sai primeiro o de menor ordem.
 */
const ORDER = ['auto-reception', 'low-stock', 'new-accounts']
const waiting = new Set<string>()
let active: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const next = () => {
  if (active || !waiting.size) return
  active = [...waiting].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0]
  waiting.delete(active)
  emit()
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

/** `ready` = o aviso tem conteúdo para mostrar. Devolve true quando é a vez deste aviso. */
export function useNoticeTurn(id: string, ready: boolean) {
  const current = useSyncExternalStore(subscribe, () => active, () => null)
  useEffect(() => {
    if (!ready) return
    waiting.add(id)
    // pequena espera para os avisos que carregam ao mesmo tempo saírem pela ordem certa
    const t = setTimeout(next, 400)
    return () => {
      clearTimeout(t)
      waiting.delete(id)
      if (active === id) { active = null; emit(); setTimeout(next, 250) }
    }
  }, [id, ready])
  return ready && current === id
}
