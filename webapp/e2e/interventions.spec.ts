import ExcelJS from 'exceljs'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const num = (t: string) => Number(t.replace(/\D/g, '')) || 0

/** Coluna de uma tabela pelo texto do cabeçalho */
async function column(page: Page, header: string) {
  const table = page.locator('table').first()
  const heads = (await table.locator('thead th').allInnerTexts()).map((t) => t.trim())
  const i = heads.findIndex((h) => h.toLowerCase() === header.toLowerCase())
  expect(i, `coluna ${header}`).toBeGreaterThanOrEqual(0)
  return table.locator('tbody tr').evaluateAll((trs, idx) => trs.map((tr) => (tr.querySelectorAll('td')[idx as number]?.textContent ?? '').trim()), i)
}

test.describe('Intervenções', () => {
  test('filtro Venda/Aluguer = Aluguer: todas as linhas são Aluguer', async ({ page }) => {
    await page.goto('/interventions')
    await page.locator('select[name="mod"]').selectOption('Aluguer')
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page).toHaveURL(/mod=Aluguer/)
    const vals = await column(page, 'Venda/Aluguer')
    expect(vals.length).toBeGreaterThan(0)
    for (const v of vals) expect(v).toMatch(/^Aluguer$/i)
  })

  test('pesquisa por IMEI encontra também o IMEI retomado/gasto', async ({ page }) => {
    // usa o IMEI gasto de uma intervenção visível na lista, através do detalhe
    await page.goto('/interventions?mod=Venda')
    await page.locator('tbody tr').first().locator('a').first().click()
    await expect(page).toHaveURL(/\/interventions\/[0-9a-f-]{36}$/)
    const imei = (await page.locator('body').innerText()).match(/\b\d{15}\b/)?.[0]
    test.skip(!imei, 'a intervenção não tem IMEI')
    await page.goto(`/interventions?plate=${imei}`)
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('Exportar Excel: as intervenções do filtro, com as folhas Intervenções e Material', async ({ page }) => {
    await page.goto('/interventions?from=2026-10-01&to=2026-10-07&mod=Venda')
    const subtitle = await page.getByText(/registos? encontrados/).first().innerText()
    const n = num(subtitle)
    expect(n).toBeGreaterThan(0)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Exportar Excel' }).click()])
    expect(dl.suggestedFilename()).toMatch(/^intervencoes_.*\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(await dl.path())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Intervenções', 'Material'])
    const ws = wb.getWorksheet('Intervenções')!
    expect(ws.rowCount - 1).toBe(n)
    const head = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? ''))
    const va = head.indexOf('Venda/Aluguer'), date = head.indexOf('Data intervenção')
    for (let r = 2; r <= ws.rowCount; r++) {
      expect(String(ws.getRow(r).getCell(va).value)).toMatch(/^venda$/i)
      const d = ws.getRow(r).getCell(date).value as Date
      expect(d.toISOString().slice(0, 10) >= '2026-10-01' && d.toISOString().slice(0, 10) <= '2026-10-07').toBe(true)
    }
  })

  test('o super admin vê o botão "Por confirmar"', async ({ page }) => {
    await page.goto('/interventions')
    await expect(page.getByRole('link', { name: 'Por confirmar' })).toBeVisible()
  })
})

test.describe('Intervenções por confirmar (Zoho Creator)', () => {
  test('a lista abre e cada linha tem "Rever e gravar" e "Dispensar"', async ({ page }) => {
    await page.goto('/interventions/drafts')
    const rows = page.locator('tbody tr')
    const empty = page.getByText('Não há intervenções por confirmar.')
    await expect(rows.first().or(empty)).toBeVisible()
    if (await empty.count()) return
    await expect(rows.first().getByRole('link', { name: 'Rever e gravar' })).toBeVisible()
    await expect(rows.first().getByRole('button', { name: 'Dispensar' })).toBeVisible()
  })

  test('"Rever e gravar" abre a Nova Intervenção pré-preenchida (sem gravar)', async ({ page }) => {
    await page.goto('/interventions/drafts')
    const link = page.getByRole('link', { name: 'Rever e gravar' }).first()
    test.skip(!(await link.count()), 'não há intervenções por confirmar')
    await link.click()
    await expect(page).toHaveURL(/\/interventions\/new\?draft=[0-9a-f-]{36}/)
    await expect(page.getByText(/Interven..o por confirmar/i).first()).toBeVisible()
    await expect(page.locator('#zoho_form')).toHaveValue(/creatorapp\.zoho\.eu\/frotcom\/.*(#Page:|record-summary)/)
    await expect(page.locator('#ticket')).not.toHaveValue('')
    await expect(page.getByRole('button', { name: /Guardar interven/i })).toBeVisible()
  })

  test('um formulário inexistente volta à lista', async ({ page }) => {
    await page.goto('/interventions/new?draft=00000000-0000-0000-0000-000000000000')
    await expect(page).toHaveURL(/\/interventions\/drafts$/)
  })
})
