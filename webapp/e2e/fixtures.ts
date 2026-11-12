import { test as base, expect } from '@playwright/test'
import { STATE_FILE } from './global-setup'

/**
 * `test` autenticado (sessão criada no global-setup); `anon` sem sessão; `withNotices` autenticado sem esconder avisos.
 * A sessão define-se na própria fixture `storageState` (um `test.use()` aqui, fora de um ficheiro de testes,
 * não tem efeito fiável). Nos testes autenticados, os avisos do login que dependem da sessão do browser
 * (intervenções por confirmar, tarefas com problema) ficam como "já vistos", para não taparem a página.
 * Fechar avisos com os botões grava na base de dados, por isso os testes nunca o fazem; além disso, as server actions
 * ficam bloqueadas nos testes autenticados (ver `page`).
 */
const empty = { cookies: [], origins: [] }

export const test = base.extend({
  storageState: async ({}, use) => { await use(STATE_FILE) },
  page: async ({ page }, use) => {
    // Bloqueia as "server actions" (POST com cabeçalho next-action): os avisos do login (stock mínimo, material
    // recebido, contas novas…) deixam de abrir por cima das páginas, e nada do que os testes fazem pode gravar.
    await page.route('**/*', (route) => {
      const r = route.request()
      return r.method() === 'POST' && r.headers()['next-action'] ? route.abort() : route.fallback()
    })
    await page.addInitScript(() => {
      try { sessionStorage.setItem('drafts-notice-seen', '1'); sessionStorage.setItem('job-problems-seen', '1') } catch { /* ignora */ }
    })
    await use(page)
  },
})
export const anon = base.extend({
  storageState: async ({}, use) => { await use(empty) },
})
export const withNotices = base.extend({
  storageState: async ({}, use) => { await use(STATE_FILE) },
})
export { expect }
