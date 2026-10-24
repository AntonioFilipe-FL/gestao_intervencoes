'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

/** Alterna entre modo claro e escuro (guardado no browser) */
export function ThemeToggle() {
  const [dark, setDark] = useState(false)
  useEffect(() => { setDark(document.documentElement.classList.contains('dark')) }, [])
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch { /* sem storage */ }
  }
  return (
    <button type="button" onClick={toggle} title={dark ? 'Modo claro' : 'Modo escuro'} aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      className="flex cursor-pointer items-center text-fc-dark-40 transition-colors hover:text-white">
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
