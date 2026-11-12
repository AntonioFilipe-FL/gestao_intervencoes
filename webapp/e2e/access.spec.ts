import { anon, expect } from './fixtures'

anon.describe('Acesso sem sessão', () => {
  for (const p of ['/', '/stock', '/stock/mobilized', '/interventions', '/interventions/drafts', '/accessories/usage', '/settings', '/reports']) {
    anon(`${p} → /login`, async ({ page }) => {
      await page.goto(p)
      await expect(page).toHaveURL(/\/login$/)
    })
  }
  for (const ex of ['/stock/mobilized/export', '/interventions/export']) {
    anon(`a exportação ${ex} exige sessão`, async ({ request }) => {
      const r = await request.get(ex, { maxRedirects: 0 })
      expect([302, 303, 307, 308]).toContain(r.status())
      expect(r.headers()['location'] ?? '').toContain('/login')
    })
  }
})

anon.describe('Tarefas automáticas (/api/cron) — CRON_SECRET', () => {
  for (const job of ['firmware-queue', 'creator-import', 'db-backup', 'restore-test']) {
    anon(`${job}: sem cabeçalho → 401`, async ({ request }) => {
      expect((await request.post(`/api/cron/${job}`)).status()).toBe(401)
    })
    anon(`${job}: segredo errado → 401`, async ({ request }) => {
      expect((await request.post(`/api/cron/${job}`, { headers: { Authorization: 'Bearer segredo-errado' } })).status()).toBe(401)
    })
    anon(`${job}: Bearer vazio → 401`, async ({ request }) => {
      expect((await request.post(`/api/cron/${job}`, { headers: { Authorization: 'Bearer ' } })).status()).toBe(401)
    })
    anon(`${job}: GET não executa a tarefa`, async ({ request }) => {
      expect([401, 405]).toContain((await request.get(`/api/cron/${job}`)).status())
    })
  }
})
