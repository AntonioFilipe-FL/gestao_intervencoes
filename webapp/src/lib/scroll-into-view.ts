/** Se o elemento estiver na metade de baixo do ecrã, centra-o (para a lista que abre por baixo ficar visível) */
export function revealBelow(el: HTMLElement | null, needed = 340) {
  if (!el) return
  const r = el.getBoundingClientRect()
  const reserved = 76 // barra fixa do fundo
  if (r.bottom + needed > window.innerHeight - reserved) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
}
