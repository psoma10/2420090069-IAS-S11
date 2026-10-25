import { test, expect } from '@playwright/test'

const themeBtn = (page) => page.getByRole('button', { name: /theme|light|dark/i }).first()
const themeState = (page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme') || document.documentElement.className || document.body.className)

test('theme toggle persists across reload', async ({ page }) => {
  await page.goto('/')
  await expect(themeBtn(page)).toBeVisible({ timeout: 15000 })
  const before = await themeState(page)
  await themeBtn(page).click()
  const after = await themeState(page)
  expect(after).not.toBe(before)
  await page.reload()
  await expect(themeBtn(page)).toBeVisible()
  expect(await themeState(page)).toBe(after)
})

test('settings page loads and saves retention', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: /settings/i }).first()).toBeVisible({ timeout: 15000 })
  const value = 2000 + Math.floor(Math.random() * 5000)
  const input = page.getByLabel(/packet/i).first()
  await expect(input).toBeVisible()
  await input.fill(String(value))
  const put = page.waitForResponse((r) => r.url().includes('/api/settings') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: /save/i }).click()
  expect((await put).status()).toBeLessThan(300)
  await page.reload()
  await expect(page.getByLabel(/packet/i).first()).toHaveValue(String(value))
})
