import { defineConfig, devices } from '@playwright/test'

/**
 * Testes de interface (só de LEITURA: não gravam nada na base de dados).
 *
 *   npm run test:e2e            → arranca a app em modo dev na porta 3100 (ou usa a que já estiver a correr) e corre os testes
 *   npm run test:e2e -- --ui    → modo interativo
 *   E2E_BASE_URL=https://… npm run test:e2e   → contra outra instância (já a correr; não arranca nada)
 *
 * A sessão é criada pelo e2e/global-setup.ts (cookie assinado com o AUTH_SECRET do .env.local) para um super admin
 * existente na tabela profiles — não há login Google nos testes. Usa a DATABASE_URL do .env.local, por isso
 * os testes não podem escrever dados.
 */
const external = process.env.E2E_BASE_URL
const port = Number(process.env.E2E_PORT ?? 3100)
const baseURL = external ?? `http://localhost:${port}`

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure', locale: 'pt-PT', timezoneId: 'Europe/Lisbon', acceptDownloads: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: external ? undefined : {
    command: `npx next dev -p ${port}`,
    url: `${baseURL}/login`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
