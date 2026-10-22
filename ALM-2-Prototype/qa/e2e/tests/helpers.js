export const API = `${process.env.API_URL || `http://127.0.0.1:${process.env.SENTINEL_API_PORT || '48731'}`}/api`

export async function openPalette(page) {
  await page.goto('/')
  await page.locator('main').first().waitFor({ state: 'attached' })
  await page.keyboard.press('Control+k')
  const dlg = page.getByRole('dialog').first()
  await dlg.waitFor({ timeout: 5000 })
  return dlg
}

// Send a brute-force scenario so alerts and a known source IP exist; returns that IP.
export async function seedAlerts(request) {
  await request.post(`${API}/simulation/reset`, { data: { keep_rules: true } })
  await request.post(`${API}/traffic/scenario/brute_force`)
  const alerts = await (await request.get(`${API}/alerts?limit=50`)).json()
  const a = alerts.find((x) => x.src_ip) || alerts[0]
  return a?.src_ip
}
