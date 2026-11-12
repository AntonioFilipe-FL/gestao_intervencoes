import { test, expect } from './fixtures'

/** Relatórios: separadores e gráficos por mês (só leitura) */
test.describe('Relatórios', () => {
  const SECS: [string, RegExp, RegExp][] = [
    ['Resumo', /sec=resumo/, /Interven..es por t.cnico/i],
    ['Por tipo e mês', /sec=tipo/, /Interven..es por tipo e m.s/i],
    ['Equipamento e cliente (12 meses)', /sec=equip/, /top 15, .ltimos 12 meses/i],
    ['Por mês', /sec=mes/, /Escolha o m.s\/ano/i],
  ]

  test('abre no separador Resumo', async ({ page }) => {
    await page.goto('/reports')
    await expect(page.getByText(/Interven..es por t.cnico/i).first()).toBeVisible()
    await expect(page.getByText(/Interven..es por tipo e m.s/i)).toHaveCount(0)
  })

  for (const [label, url, content] of SECS) {
    test(`separador "${label}" mostra só a sua parte`, async ({ page }) => {
      await page.goto('/reports')
      await page.getByRole('link', { name: label, exact: true }).click()
      await expect(page).toHaveURL(url)
      await expect(page.getByText(content).first()).toBeVisible()
      for (const [, , other] of SECS.filter(([l]) => l !== label)) await expect(page.getByText(other)).toHaveCount(0)
    })
  }

  test('Por mês: escolher o mês mantém o separador e mostra esse mês', async ({ page }) => {
    await page.goto('/reports?sec=mes')
    await page.locator('input[name="mes"]').fill('2026-10')
    await page.getByRole('button', { name: 'Ver' }).click()
    await expect(page).toHaveURL(/sec=mes/)
    await expect(page).toHaveURL(/mes=2026-10/)
    await expect(page.getByText(/outubro de 2026/i).first()).toBeVisible()
  })

  test('Por mês: filtrar por tipo mantém o separador e o mês', async ({ page }) => {
    await page.goto('/reports?sec=mes&mes=2026-10')
    await page.locator('#mes-equipamento').getByRole('link', { name: /^Assist/i }).first().click()
    await expect(page).toHaveURL(/sec=mes/)
    await expect(page).toHaveURL(/mes=2026-10/)
    await expect(page).toHaveURL(/metipo=/)
  })
})
