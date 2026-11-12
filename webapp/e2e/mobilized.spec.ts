import ExcelJS from 'exceljs'
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
const num = (t: string) => Number(t.replace(/\s| /g, '').replace(/\./g, '')) || 0

/** Lê a matriz da página: nomes dos clientes (1.ª coluna), equipamentos (cabeçalho) e a linha de totais */
async function readMatrix(page: Page) {
  const table = page.locator('table').first()
  await expect(table).toBeVisible()
  const head = (await table.locator('thead th').allInnerTexts()).map((t) => t.trim())
  const rows = await table.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => (td.textContent ?? '').trim())))
  const total = rows[rows.length - 1]
  const clients = rows.slice(0, -1)
  return { equipments: head.slice(1, -1), clients, clientNames: clients.map((r) => r[0]), total, grand: num(total[total.length - 1]) }
}

test.describe('Mobilizado por cliente', () => {
  test('cada cliente aparece uma só vez (nome da Intranet)', async ({ page }) => {
    await page.goto('/stock/mobilized')
    const m = await readMatrix(page)
    expect(m.clientNames.length).toBeGreaterThan(0)
    const dup = m.clientNames.map(fold).filter((n, i, a) => a.indexOf(n) !== i)
    expect(dup, 'clientes repetidos na matriz').toEqual([])
  })

  test('os totais da matriz são coerentes', async ({ page }) => {
    await page.goto('/stock/mobilized')
    const m = await readMatrix(page)
    expect(m.clients.reduce((a, r) => a + num(r[r.length - 1]), 0)).toBe(m.grand)
    m.equipments.forEach((_, i) => {
      expect(m.clients.reduce((a, r) => a + num(r[i + 1]), 0)).toBe(num(m.total[i + 1]))
    })
    await expect(page.getByText(`${m.grand.toLocaleString('pt-PT')} equipamento(s) em`)).toBeVisible()
  })

  test('filtro por equipamento deixa só essa coluna', async ({ page }) => {
    await page.goto('/stock/mobilized')
    const eq = (await page.locator('select[name="eq"] option').nth(1).innerText()).trim()
    await page.locator('select[name="eq"]').selectOption({ label: eq })
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page).toHaveURL(/eq=/)
    const m = await readMatrix(page)
    expect(m.equipments).toEqual([eq])
  })

  test('filtro por cliente (parte do nome, sem acentos nem maiúsculas) restringe as linhas', async ({ page }) => {
    await page.goto('/stock/mobilized')
    const first = (await readMatrix(page)).clientNames.find((n) => !/^Sem cliente/.test(n) && n.length >= 4)!
    const part = first.slice(0, 4).toUpperCase()
    await page.locator('input[name="client"]').fill(part)
    await page.getByRole('button', { name: 'Filtrar' }).click()
    await expect(page).toHaveURL(/client=/)
    const m = await readMatrix(page)
    expect(m.clientNames).toContain(first)
    for (const n of m.clientNames) expect(fold(n)).toContain(fold(part))
    await page.getByRole('link', { name: 'Limpar' }).click()
    await expect(page).toHaveURL(/\/stock\/mobilized$/)
  })

  test('filtro sem resultados mostra mensagem', async ({ page }) => {
    await page.goto('/stock/mobilized?client=zzzz-nao-existe-zzzz')
    await expect(page.getByText(/Sem equipamentos mobilizados/)).toBeVisible()
  })

  test('clicar numa quantidade mostra os IMEIs, em igual número', async ({ page }) => {
    await page.goto('/stock/mobilized')
    const link = page.locator('tbody tr').first().locator('td a').first()
    const qty = num(await link.innerText())
    await link.click()
    const card = page.locator('#imeis')
    await expect(card).toBeVisible()
    await expect(card.locator('tbody tr')).toHaveCount(qty)
    const imei = (await card.locator('tbody tr').first().locator('td').first().innerText()).trim()
    expect(imei).toMatch(/^\d{14,16}$/)
  })

  test('Exportar Excel: .xlsx com a matriz e os IMEIs, iguais à página', async ({ page }) => {
    await page.goto('/stock/mobilized')
    const m = await readMatrix(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Exportar Excel/ }).click()])
    expect(dl.suggestedFilename()).toMatch(/^mobilizado_por_cliente_\d{4}-\d{2}-\d{2}\.xlsx$/)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(await dl.path())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Cliente × equipamento', 'IMEIs'])
    const matrix = wb.getWorksheet('Cliente × equipamento')!
    const last = matrix.getRow(matrix.rowCount)
    expect(last.getCell(1).value).toBe('Total')
    expect(Number(last.getCell(matrix.columnCount).value)).toBe(m.grand)
    expect(matrix.rowCount - 2).toBe(m.clientNames.length) // menos o cabeçalho e a linha de total
    const imeis = wb.getWorksheet('IMEIs')!
    expect(imeis.rowCount - 1).toBe(m.grand)
    expect(String(imeis.getRow(2).getCell(3).value)).toMatch(/^\d{14,16}$/)
  })

  test('Exportar Excel respeita os filtros', async ({ page }) => {
    await page.goto('/stock/mobilized')
    const eq = (await page.locator('select[name="eq"] option').nth(1).innerText()).trim()
    await page.goto(`/stock/mobilized?eq=${encodeURIComponent(eq)}`)
    const m = await readMatrix(page)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: /Exportar Excel/ }).click()])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(await dl.path())
    const imeis = wb.getWorksheet('IMEIs')!
    expect(imeis.rowCount - 1).toBe(m.grand)
    for (let r = 2; r <= imeis.rowCount; r++) expect(imeis.getRow(r).getCell(2).value).toBe(eq)
  })
})
