import { test, withNotices, expect } from './fixtures'

/** Configurações, stock, acessórios e atualização de equipamento — só verificações de leitura (nada é gravado) */
test.describe('Configurações (super admin)', () => {
  test('separador Perfis: grelha com o Administrador sempre com todos os acessos', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Perfis' }).click()
    await expect(page.getByRole('heading', { name: 'Perfis' })).toBeVisible()
    const admin = page.locator('tr', { has: page.locator('input[value="Administrador"]') })
    await expect(admin).toBeVisible()
    await expect(admin.locator('select')).toHaveCount(0) // o Administrador não se edita
  })

  test('separador Super admin: Cópias de segurança no Google Drive', async ({ page }) => {
    await page.goto('/settings?tab=superadmin')
    await expect(page.getByRole('heading', { name: 'Cópias de segurança' })).toBeVisible()
    await expect(page.getByText(/Backup_Gestao_Interv/)).toBeVisible()
    await expect(page.getByText(/Google Drive: ligado/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Fazer cópia agora' })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Testar reposição' })).toBeEnabled()
  })

  test('separador Acessórios: secção dos sinónimos', async ({ page }) => {
    await page.goto('/settings')
    await page.getByRole('tab', { name: 'Acessórios', exact: true }).click()
    await expect(page.getByText(/Sinónimos de acessórios/i)).toBeVisible()
  })
})

test.describe('Stock', () => {
  test('Transferência pergunta "Equipamento e acessórios" ou "Só o equipamento"', async ({ page }) => {
    await page.goto('/stock')
    const dlg = page.getByRole('dialog')
    // a página pode ainda não estar pronta (hidratação) no 1.º clique, sobretudo em modo dev: repete até abrir
    await expect(async () => {
      await page.getByRole('button', { name: /Transferência/ }).click()
      await expect(dlg.getByText('O que transferir?')).toBeVisible({ timeout: 2000 })
    }).toPass({ timeout: 30_000 })
    await expect(dlg.getByText('O que transferir?')).toBeVisible()
    await expect(dlg.getByLabel(/Equipamento e acessórios/)).toBeVisible()
    await expect(dlg.getByLabel(/Só o equipamento/)).toBeVisible()
    await expect(dlg.getByRole('button', { name: /Registar/ })).toBeDisabled()
    await dlg.getByRole('button', { name: 'Fechar' }).click()
  })

  test('Histórico de transferências: lotes de ajuste têm "Anular ajuste" (sem anular)', async ({ page }) => {
    await page.goto('/stock/transfers?kind=ajuste')
    const batch = page.locator('details').first()
    test.skip(!(await batch.count()), 'não há lotes de ajuste')
    await batch.locator('summary').click()
    await expect(batch.getByRole('button', { name: 'Anular ajuste' }).or(batch.getByText(/já não conta/)).first()).toBeVisible()
  })
})

test.describe('Stock de acessórios', () => {
  test('Utilização / entradas: só utilização mostra apenas saídas', async ({ page }) => {
    await page.goto('/accessories')
    await page.getByRole('link', { name: /Utiliza..o \/ entradas/i }).click()
    await expect(page).toHaveURL(/\/accessories\/usage/)
    await page.locator('select[name="type"]').selectOption('uso')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page).toHaveURL(/type=uso/)
    const table = page.locator('table').last()
    const head = (await table.locator('thead th').allInnerTexts()).map((t) => t.trim())
    const q = head.findIndex((h) => /^Qtd/.test(h))
    const vals = await table.locator('tbody tr').evaluateAll((trs, i) => trs.map((tr) => (tr.querySelectorAll('td')[i as number]?.textContent ?? '').trim()), q)
    for (const v of vals.filter((x) => /\d/.test(x))) expect(v).toMatch(/^[-−]/)
  })
})

test.describe('Atualização de equipamento', () => {
  test('botões por modelo; no CAN chip só o FMC150', async ({ page }) => {
    await page.goto('/equipment-update')
    for (const m of ['FMC640', 'FMC150', 'C4MAX V8']) await expect(page.getByRole('button', { name: m, exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'CAN chip (FMC150)' }).click()
    await expect(page.getByRole('button', { name: 'FMC150', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'FMC640', exact: true })).toHaveCount(0)
  })

  test('o histórico não carrega sozinho (botão "Ver histórico")', async ({ page }) => {
    await page.goto('/equipment-update')
    await expect(page.getByRole('link', { name: /Ver hist.rico de atualiza/i })).toBeVisible()
    await expect(page.getByText(/Verifica..o na Intranet/)).toHaveCount(0)
  })
})

withNotices.describe('Avisos do login', () => {
  withNotices('não fecham ao clicar fora nem com Esc (só nos botões)', async ({ page }) => {
    await page.goto('/interventions')
    const dlg = page.getByRole('dialog').first()
    await dlg.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {})
    withNotices.skip(!(await dlg.isVisible()), 'não há nenhum aviso para mostrar agora')
    await page.keyboard.press('Escape')
    await page.mouse.click(5, 5)
    await expect(dlg).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(1) // só um de cada vez
  })
})
