import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.resolve(here, '../screenshots')
fs.mkdirSync(shots, { recursive: true })

const API = `${process.env.API_URL || `http://127.0.0.1:${process.env.SENTINEL_API_PORT || '48731'}`}/api`


const ROUTES = [
  ['/', /overview/i, 'home'],
  ['/firewall', /firewall rule manager/i, 'firewall'],
  ['/hosts', /hosts & bastion/i, 'hosts'],
  ['/traffic', /traffic/i, 'traffic'],
  ['/alerts', /alert panel/i, 'alerts'],
  ['/anomaly', /anomaly detector/i, 'anomaly'],
  ['/ids-rules', /detection rules/i, 'ids-rules'],
  ['/encyclopedia', /threat atlas/i, 'encyclopedia'],
  ['/lab', /guided labs/i, 'lab'],
  ['/about', /about sentinel/i, 'about'],
]

function attach(page, bag) {
  page.on('console', (m) => {
    if (m.type() === 'error') bag.push(`console.error: ${m.text()} @ ${m.location().url}`)
  })
  page.on('pageerror', (e) => bag.push(`pageerror: ${e.message}`))
  page.on('requestfailed', (r) => {
    if (!r.url().includes('/alerts/stream')) bag.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`)
  })
  page.on('response', (r) => {
    if (r.url().includes('/api/') && r.status() >= 400) bag.push(`http ${r.status()}: ${r.request().method()} ${r.url()}`)
  })
}

test.beforeAll(async ({ request }) => {
  await request.post(`${API}/simulation/reset`, { data: { keep_rules: true } })
})

for (const [route, heading, name] of ROUTES) {
  test(`route ${route}`, async ({ page }) => {
    const errs = []
    attach(page, errs)
    await page.goto(route)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1500)
    await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true })
    expect(errs, errs.join('\n')).toEqual([])
  })
}

test('route /encyclopedia/<first slug>', async ({ page }) => {
  const errs = []
  attach(page, errs)
  await page.goto('/encyclopedia')
  const href = await page.locator('a[href^="/encyclopedia/"]').first().getAttribute('href')
  expect(href).toBeTruthy()
  await page.goto(href)
  await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Article not found')).toHaveCount(0)
  await page.waitForTimeout(1000)
  await page.screenshot({ path: path.join(shots, 'encyclopedia-article.png'), fullPage: true })
  expect(errs, errs.join('\n')).toEqual([])
})

test('unknown route renders NotFound without crashing', async ({ page }) => {
  const errs = []
  attach(page, errs)
  await page.goto('/definitely-not-a-route')
  await expect(page.locator('main')).toContainText(/not found|404/i)
  expect(errs, errs.join('\n')).toEqual([])
})

test('flow: ssh brute force scenario -> alert appears', async ({ page, request }) => {
  const errs = []
  attach(page, errs)
  await request.post(`${API}/simulation/reset`, { data: { keep_rules: true } })
  await page.goto('/traffic')
  const card = page.locator('article.tg-scn', { has: page.getByRole('heading', { name: /brute/i }) })
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.getByRole('button', { name: /launch/i }).click()
  await expect(page.getByText(/Results:/)).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: path.join(shots, 'flow-traffic-after-launch.png'), fullPage: true })
  await page.goto('/alerts')
  await expect(page.getByText(/IDS-001|brute/i).first()).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: path.join(shots, 'flow-alerts.png'), fullPage: true })
  const alerts = await (await request.get(`${API}/alerts?limit=200`)).json()
  expect(alerts.some((a) => a.rule_id === 'IDS-001')).toBeTruthy()
  expect(errs, errs.join('\n')).toEqual([])
})
