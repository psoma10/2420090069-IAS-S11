import { test, expect } from '@playwright/test'
import { openPalette } from './helpers.js'

test('Ctrl+K opens the command palette and navigates', async ({ page }) => {
  const dlg = await openPalette(page)
  const input = dlg.getByRole('combobox').or(dlg.getByRole('textbox')).first()
  await input.fill('firewall')
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/firewall/)
  await expect(page.getByRole('heading', { name: /firewall rule manager/i }).first()).toBeVisible()
})

test('Escape closes the palette', async ({ page }) => {
  const dlg = await openPalette(page)
  await page.keyboard.press('Escape')
  await expect(dlg).toBeHidden()
})

test('typing an IPv4 offers Investigate', async ({ page }) => {
  const dlg = await openPalette(page)
  const input = dlg.getByRole('combobox').or(dlg.getByRole('textbox')).first()
  await input.fill('203.0.113.9')
  const opt = dlg.getByText(/investigate/i).first()
  await expect(opt).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/investigate\/203\.0\.113\.9/)
})
