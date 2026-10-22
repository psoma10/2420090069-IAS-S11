import { test, expect } from '@playwright/test'
import { API, seedAlerts } from './helpers.js'

test('investigate API returns data for a seeded IP', async ({ request }) => {
  const ip = await seedAlerts(request)
  expect(ip).toBeTruthy()
  const res = await request.get(`${API}/investigate/${ip}`)
  expect(res.status()).toBe(200)
})

test('investigate page for a seeded IP renders stat tiles', async ({ page, request }) => {
  const ip = await seedAlerts(request)
  expect(ip).toBeTruthy()
  await page.goto(`/investigate/${ip}`)
  await expect(page.locator('.inv-id__ip')).toBeVisible({ timeout: 15000 })
  // stat tiles: several labelled numeric figures
  const tiles = page.locator('.ui-stat')
  await expect(tiles.first()).toBeVisible({ timeout: 15000 })
  expect(await tiles.count()).toBeGreaterThanOrEqual(3)
})

test('alert row has Investigate and Block actions', async ({ page, request }) => {
  await seedAlerts(request)
  await page.goto('/alerts')
  await page.locator('button.ap-alert__head').first().click({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /block/i }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /investigate/i }).first()).toBeVisible()
})
