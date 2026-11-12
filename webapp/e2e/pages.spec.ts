import { test, expect } from './fixtures'

/** Fumo: cada página principal abre com sessão, sem erro da aplicação e sem voltar ao login */
const PAGES: [string, RegExp | null][] = [
  ['/interventions', /Interven/i],
  ['/interventions/new', null],
  ['/interventions/drafts', null],
  ['/stock', /Stock material/i],
  ['/stock/mobilized', /Mobilizado por cliente/i],
  ['/stock/transfers', /Hist.rico de transfer/i],
  ['/accessories', /Stock de acess.rios/i],
  ['/accessories/usage', /Utiliza..o de acess.rios/i],
  ['/equipment-update', null],
  ['/reports', null],
  ['/settings', null],
  ['/help', null],
]

for (const [path, title] of PAGES) {
  test(`abre ${path}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const res = await page.goto(path)
    expect(res?.status()).toBeLessThan(400)
    await expect(page).not.toHaveURL(/\/(login|unauthorized)/)
    await expect(title ? page.getByRole('heading', { name: title }).first() : page.locator('h1, h2').first()).toBeVisible()
    await expect(page.getByText(/Application error|Unhandled Runtime Error/i)).toHaveCount(0)
    expect(errors, 'erros de JavaScript na página').toEqual([])
  })
}

test('a Ajuda documenta a exceção da conta Suspended', async ({ page }) => {
  await page.goto('/help')
  // as secções da Ajuda estão fechadas (só a 1.ª abre): abre todas
  await page.locator('details').evaluateAll((ds) => ds.forEach((d) => d.setAttribute('open', '')))
  await expect(page.getByText('Frotcom Lusitana - Suspended').first()).toBeVisible()
})
