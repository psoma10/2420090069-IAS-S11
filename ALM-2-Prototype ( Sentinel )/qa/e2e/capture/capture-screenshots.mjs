#!/usr/bin/env node
/**
 * Sentinel documentation screenshot capture.
 *
 * Resets + seeds the simulation, switches the live traffic feed on at a high rate, waits for the charts to
 * fill with real data and the event stream chip to say "Live", then walks the app and writes a numbered set of
 * desktop (1920x1080) PNGs plus output/INDEX.md (captions generated from the same SHOTS table below).
 *
 *   BASE_URL=http://localhost:48732 API=http://localhost:48731 OUT=../../../output node capture-screenshots.mjs
 *
 * Optional env: ONLY=01,05 (ids to capture), LIGHT=0 (skip light pass), KEEP_LIVE=1 (do not restore the live
 * feed settings afterwards), SCALE=2 (deviceScaleFactor), HEADED=1, WARMUP_MAX=150 (seconds).
 * Exit code: 0 ok, 1 a mandatory shot failed, 2 a server is not reachable.
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE = (process.env.BASE_URL || 'http://localhost:48732').replace(/\/$/, '')
const API = (process.env.API || process.env.API_URL || 'http://localhost:48731').replace(/\/$/, '')
const OUT = path.resolve(process.env.OUT || path.join(here, '../../../output'))
const SCALE = Number(process.env.SCALE || 1)
const ONLY = process.env.ONLY ? process.env.ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null
const DO_LIGHT = process.env.LIGHT !== '0'
const VIEW = { width: 1920, height: 1080 }
const MAX_TALL = 3200 // never stretch a full-height capture beyond this many CSS px

const log = (...a) => console.log(...a)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ API helpers */
async function api(method, p, body) {
  const res = await fetch(`${API}/api${p}`, {
    method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text.slice(0, 200)}`)
  try { return JSON.parse(text) } catch { return text }
}

async function poll(fn, { timeout = 20000, every = 400, what = 'condition' } = {}) {
  const end = Date.now() + timeout
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await sleep(every)
  }
}

async function preflight() {
  const need = async (label, url) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
    } catch (e) {
      console.error(`\nERROR: cannot reach ${label} at ${url} (${e.message}).`)
      console.error(`Start the servers first (backend + frontend dev server) or set BASE_URL / API.\n`)
      process.exit(2)
    }
  }
  await need('backend API', `${API}/api/health`)
  await need('frontend', BASE)
  await need('frontend -> API proxy', `${BASE}/api/health`)
}

/* ------------------------------------------------------------------ page helpers */
async function settle(page, { extra = 900, fast = false } = {}) {
  await page.waitForLoadState('load')
  await page.waitForFunction(() => !document.querySelector('main .ui-spinner'), null, { timeout: 20000 })
  await page.evaluate(() => Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]))
  // charts: if a recharts wrapper exists it must contain drawn geometry
  await page.waitForFunction(() => {
    const ws = [...document.querySelectorAll('main .recharts-wrapper')]
    return ws.every((w) => w.querySelector('path, rect, circle'))
  }, null, { timeout: 15000 }).catch(() => {})
  if (!fast) await page.waitForTimeout(extra) // recharts animates in JS; CSS animations are frozen at screenshot time
  await page.mouse.move(VIEW.width / 2, 1)
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo({ top: 0, left: 0, behavior: 'instant' }) })
  await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 3000 }).catch(() => {})
}

async function go(page, route, headingRe) {
  await page.goto(BASE + route, { waitUntil: 'domcontentloaded' })
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 20000 })
  if (headingRe) await page.locator('main h1').filter({ hasText: headingRe }).first().waitFor({ timeout: 10000 })
  await page.locator('.livechip.is-live').waitFor({ timeout: 20000 }) // event stream chip must read "Live"
}

async function setTheme(page, theme) {
  await page.addInitScript((t) => { try { localStorage.setItem('sentinel.theme', t) } catch { /* ignore */ } }, theme)
}

async function takeShot(page, shot, file) {
  const base = { path: file, animations: 'disabled', caret: 'hide', scale: 'device' }
  if (shot.clip) {
    await page.screenshot({ ...base, clip: shot.clip })
    return 'clip'
  }
  if (shot.tall === false) {
    await page.screenshot(base)
    return 'viewport'
  }
  const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
  if (h <= VIEW.height + 8) {
    await page.screenshot(base)
    return 'viewport'
  }
  // Naturally longer than the viewport: grow the viewport so the sticky sidebar/topbar span the whole capture.
  const tall = Math.min(h, MAX_TALL)
  await page.setViewportSize({ width: VIEW.width, height: tall })
  await page.waitForTimeout(900)
  await settle(page, { fast: true })
  await page.screenshot(base)
  await page.setViewportSize(VIEW)
  await page.waitForTimeout(300)
  return `full-height (${tall}px)`
}

async function pickAttackerIp() {
  const alerts = await api('GET', '/alerts?limit=200')
  const score = { critical: 4, high: 3, medium: 2, low: 1 }
  const tally = new Map()
  const rules = new Map()
  for (const a of alerts) {
    if (!a.src_ip || /^(10\.|192\.168\.)/.test(a.src_ip)) continue
    tally.set(a.src_ip, (tally.get(a.src_ip) || 0) + (score[a.severity] || 1))
    if (!rules.has(a.src_ip)) rules.set(a.src_ip, new Set())
    rules.get(a.src_ip).add(a.rule_id)
  }
  // prefer the address that tripped the most different detections (a richer story), then the most severe
  for (const [ip, set] of rules) tally.set(ip, set.size * 100 + tally.get(ip))
  const best = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  if (!best) throw new Error('no external source IP in the alert list')
  return best[0]
}

async function launchScenario(page, titleRe) {
  const card = page.locator('article.tg-scn').filter({ has: page.locator('h3', { hasText: titleRe }) }).first()
  await card.waitFor({ timeout: 15000 })
  await card.getByRole('button', { name: /launch/i }).click()
}

// The app smooth-scrolls to results after a scenario launch: wait until the scroll position stops changing.
async function scrollQuiet(page, ms = 500) {
  let last = -1, since = Date.now()
  const end = Date.now() + 8000
  while (Date.now() < end) {
    const y = await page.evaluate(() => Math.round(window.scrollY))
    if (y !== last) { last = y; since = Date.now() } else if (Date.now() - since >= ms) return
    await page.waitForTimeout(100)
  }
}

const toastsGone = (page) => page.waitForFunction(() => !document.querySelector('.ui-toast'), null, { timeout: 12000 })

/* ------------------------------------------------------------------ the shot table (single source of truth) */
/**
 * id/file/title/caption feed INDEX.md. mandatory: failing fails the run. light: also captured in the light theme
 * (written to output/light/<file>). tall:false forces a 1920x1080 viewport capture; clip crops to a region.
 * optional(): returns false when the feature is absent in this build -> shot is skipped gracefully.
 */
const SHOTS = [
  {
    id: '01', file: '01-overview.png', title: 'Overview dashboard', mandatory: true, light: true,
    caption: 'Overview dashboard with live throughput, blocked traffic, severity mix and top sources while the live traffic feed is running.',
    run: async ({ page }) => { await go(page, '/', /overview/i); await page.locator('.recharts-wrapper').first().waitFor() },
  },
  {
    id: '02', file: '02-alerts-live.png', title: 'Alert panel', mandatory: true, light: true,
    caption: 'Alert panel streaming intrusion alerts in real time, with severity counters, filters and per-alert actions.',
    run: async ({ page }) => { await go(page, '/alerts', /alert/i); await page.locator('li.ap-alert').first().waitFor() },
  },
  {
    id: '03', file: '03-anomaly-detector.png', title: 'Anomaly detector', mandatory: true, light: true,
    caption: 'Anomaly detector: per-metric time series against the learned baseline and the mean + sigma threshold.',
    run: async ({ page }) => { await go(page, '/anomaly', /anomaly/i); await page.locator('.recharts-wrapper').first().waitFor() },
  },
  {
    id: '04', file: '04-firewall-rules.png', title: 'Firewall rule manager', mandatory: true, light: true,
    caption: 'Firewall rule manager: default policy, bastion mode, the ordered rule table with hit counters, and the packet tester.',
    run: async ({ page }) => { await go(page, '/firewall', /firewall rule manager/i); await page.locator('main table tbody tr').first().waitFor() },
  },
  {
    id: '04b', file: '04b-firewall-add-rule-dialog.png', title: 'Add firewall rule dialog', mandatory: true, tall: false,
    caption: 'Add rule dialog of the firewall manager, filled in with a rule that blocks inbound Telnet.',
    run: async ({ page }) => {
      await go(page, '/firewall', /firewall rule manager/i)
      await page.locator('main table tbody tr').first().waitFor()
      await page.getByRole('button', { name: /^add rule$/i }).click()
      const dlg = page.getByRole('dialog').first()
      await dlg.waitFor()
      await dlg.getByPlaceholder('e.g. Block Telnet').fill('Block inbound Telnet')
      await dlg.locator('select').first().selectOption('deny')
      await dlg.getByPlaceholder('80 or 1000-2000').fill('23')
      await dlg.getByPlaceholder('10.0.1.0/24').fill('10.0.0.0/16')
      await dlg.getByRole('textbox').last().fill('Telnet sends credentials in clear text.')
    },
    cleanup: async ({ page }) => { await page.keyboard.press('Escape') },
  },
  {
    id: '05', file: '05-hosts-bastion.png', title: 'Hosts and bastion topology', mandatory: true, light: true,
    caption: 'Hosts and bastion page with bastion mode enforced: external traffic may reach only the hardened bastion host.',
    run: async ({ page }) => {
      await go(page, '/hosts', /hosts/i)
      const on = page.getByRole('button', { name: /^enable bastion mode$/i })
      if (await on.count()) await on.click()
      await page.getByRole('button', { name: /^disable bastion mode$/i }).waitFor()
      await page.getByText(/Bastion mode ON/).first().waitFor()
    },
  },
  {
    id: '06', file: '06-traffic-generator.png', title: 'Packet Forge (traffic generator)', mandatory: true,
    caption: 'Packet Forge: choose a traffic type, configure the packet, or launch a ready-made attack scenario.',
    run: async ({ page }) => { await go(page, '/traffic', /packet forge/i); await page.locator('article.tg-scn').first().waitFor() },
  },
  {
    id: '06b', file: '06b-traffic-scenario-results.png', title: 'Scenario result stream', mandatory: true,
    caption: 'Result stream after launching the SSH brute-force scenario: each packet with its firewall verdict and IDS outcome.',
    run: async ({ page }) => {
      await go(page, '/traffic', /packet forge/i)
      await launchScenario(page, /brute/i)
      await page.locator('main h2', { hasText: /^Results:/ }).waitFor({ timeout: 20000 })
      await toastsGone(page)
      // the stream auto-scrolls its own list to the newest row: wait until it stops growing, then show it from the top
      let n = -1, stable = 0
      for (let i = 0; i < 60 && stable < 5; i++) {
        const c = await page.locator('.tg-rows li').count()
        stable = c === n ? stable + 1 : 0
        n = c
        await page.waitForTimeout(200)
      }
      await page.evaluate(() => { document.querySelectorAll('.tg-rows').forEach((e) => { e.scrollTop = 0 }) })
      await scrollQuiet(page)
    },
  },
  {
    id: '07', file: '07-ids-detection-rules.png', title: 'IDS detection rules', mandatory: true, light: true,
    caption: 'IDS detection rules with thresholds, time windows, severities and the enable switch for each signature.',
    run: async ({ page }) => { await go(page, '/ids-rules', /detection rules/i); await page.getByText(/IDS-001/).first().waitFor() },
  },
  {
    id: '08', file: '08-investigate-ip.png', title: 'Investigate an IP address', mandatory: true,
    caption: 'Investigate view for an attacker address taken from the alert list: traffic, alerts, rules hit and peers.',
    run: async ({ page, ctx }) => {
      ctx.attacker = ctx.attacker || await pickAttackerIp()
      await go(page, `/investigate/${ctx.attacker}`, /investigate/i)
      await page.getByText(ctx.attacker).first().waitFor()
      await page.getByRole('button', { name: /block this ip/i }).waitFor({ timeout: 15000 })
    },
  },
  {
    id: '09', file: '09-guided-labs.png', title: 'Guided labs', mandatory: true,
    caption: 'Guided labs index: hands-on exercises that drive the live simulator and track progress.',
    run: async ({ page }) => { await go(page, '/lab', /guided labs/i); await page.locator('button.lb-card').first().waitFor() },
  },
  {
    id: '09b', file: '09b-guided-lab-steps.png', title: 'A guided lab in progress', mandatory: false,
    caption: 'The first guided lab opened, showing its step-by-step instructions and one-click simulator actions.',
    run: async ({ page }) => {
      await go(page, '/lab', /guided labs/i)
      await page.locator('button.lb-card').first().click()
      await page.getByRole('button', { name: /all labs/i }).waitFor()
    },
  },
  {
    id: '10', file: '10-threat-encyclopedia.png', title: 'Threat Encyclopedia', mandatory: true,
    caption: 'Threat Encyclopedia (the Threat Atlas): searchable cards for common attacks and malware families.',
    run: async ({ page }) => { await go(page, '/encyclopedia', /threat atlas/i); await page.locator('a[href^="/encyclopedia/"]').first().waitFor() },
  },
  {
    id: '10b', file: '10b-threat-article.png', title: 'Threat article', mandatory: true,
    caption: 'A Threat Encyclopedia article: how the attack works, how Sentinel detects it and how to defend.',
    run: async ({ page }) => {
      await go(page, '/encyclopedia', /threat atlas/i)
      await page.locator('a[href^="/encyclopedia/"]').first().click()
      await page.waitForURL(/\/encyclopedia\/[^/?#]+/)
      await page.locator('main h1').first().waitFor()
      await page.getByText('Article not found').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
    },
  },
  {
    id: '11', file: '11-settings.png', title: 'Settings', mandatory: true, light: true,
    caption: 'Settings: appearance, the live traffic feed panel (rate and attack interval), data retention and data tools.',
    run: async ({ page }) => {
      await go(page, '/settings', /settings/i)
      await page.getByText('Live traffic feed', { exact: true }).waitFor()
      await page.locator('.settings__live').getByText('Running').waitFor()
    },
  },
  {
    id: '12', file: '12-command-palette.png', title: 'Command palette', mandatory: true, tall: false,
    caption: 'Command palette (Ctrl+K) filtering pages and actions as you type; it also accepts an IP address to investigate.',
    run: async ({ page }) => {
      await go(page, '/', /overview/i)
      await page.locator('.recharts-wrapper').first().waitFor()
      await page.keyboard.press('Control+k')
      await page.getByRole('dialog', { name: /command palette/i }).waitFor()
      await page.getByRole('combobox', { name: /search pages and actions/i }).fill('re')
      await page.locator('#cp-list [role=option]').first().waitFor()
      await page.waitForTimeout(300)
    },
    cleanup: async ({ page }) => { await page.keyboard.press('Escape') },
  },
  {
    id: '13', file: '13-about.png', title: 'About', mandatory: true,
    caption: 'About page: purpose, architecture diagram and the concepts the simulator demonstrates.',
    run: async ({ page }) => { await go(page, '/about', /about sentinel/i) },
  },
  /* ---- story shots: real-time behaviour ---- */
  {
    id: '16', file: '16-story-overview-before-ddos.png', title: 'Overview before a DDoS', mandatory: false,
    caption: 'Real-time story, step 1: the Overview during normal background traffic, before the DDoS scenario is launched.',
    run: async ({ page, ctx }) => {
      await go(page, '/', /overview/i)
      await page.locator('.recharts-wrapper').first().waitFor()
      ctx.before = (await api('GET', '/stats/summary')).alerts_total
    },
  },
  {
    id: '17', file: '17-story-overview-after-ddos.png', title: 'Overview after a DDoS', mandatory: false,
    caption: 'Real-time story, step 2: a few seconds after launching the DDoS scenario the blocked-traffic share, alert counter and throughput spike are visible.',
    run: async ({ page, ctx }) => {
      const before = ctx.before ?? (await api('GET', '/stats/summary')).alerts_total
      await api('POST', '/traffic/scenario/ddos')
      await poll(async () => (await api('GET', '/stats/summary')).alerts_total > before, { what: 'DDoS alerts' })
      await page.waitForTimeout(3500) // let the event stream push the new buckets into the charts
    },
  },
  {
    id: '18', file: '18-story-alert-toast.png', title: 'Alert toast', mandatory: false, tall: false, fast: true,
    caption: 'Real-time story: a launched port-scan scenario immediately raises alerts, announced by a toast notification.',
    run: async ({ page }) => {
      await go(page, '/traffic', /packet forge/i)
      await page.locator('article.tg-scn').first().waitFor()
      await settle(page, { extra: 600 })
      await launchScenario(page, /port scan/i)
      await page.locator('.ui-toast--warn').waitFor({ timeout: 15000 })
      await scrollQuiet(page, 400)
      await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
      await page.waitForTimeout(250)
    },
    cleanup: async ({ page }) => { await toastsGone(page).catch(() => {}) },
  },
  {
    id: '19', file: '19-story-live-feed-control.png', title: 'Live feed control', mandatory: false,
    clip: { x: 0, y: 0, width: VIEW.width, height: 72 }, tall: false,
    caption: 'Top bar with the "Live feed: On" control, theme toggle, search shortcut and the Reseed and Reset actions.',
    run: async ({ page }) => {
      await go(page, '/', /overview/i)
      await page.locator('.feedbtn.is-on').waitFor()
    },
  },
  /* ---- audit log: only when the build has the route ---- */
  {
    id: '14', file: '14-audit-log.png', title: 'Audit log: admin actions', mandatory: false, tall: false, optional: 'audit',
    caption: 'Audit log, admin actions tab: who changed which firewall rule, host, policy or setting, and when.',
    run: async ({ page }) => {
      await go(page, '/audit', /audit/i)
      const tab = page.getByRole('tab', { name: /admin/i }).first()
      if (await tab.count()) await tab.click()
      await page.waitForFunction(() => !/could not load/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 8000 })
      await page.waitForTimeout(500)
    },
  },
  {
    id: '15', file: '15-audit-log-security.png', title: 'Audit log: security events', mandatory: false, tall: false, optional: 'audit',
    caption: 'Audit log, security events tab: detections and firewall decisions recorded for later review.',
    run: async ({ page }) => {
      await go(page, '/audit', /audit/i)
      const tab = page.getByRole('tab', { name: /security/i }).first()
      if (await tab.count()) await tab.click()
      await page.waitForFunction(() => !/could not load/i.test(document.querySelector('main')?.innerText || ''), null, { timeout: 8000 })
      await page.waitForTimeout(500)
    },
  },
]

async function auditRouteExists(browser, theme) {
  const ctx = await browser.newContext({ viewport: VIEW })
  const page = await ctx.newPage()
  try {
    await page.goto(BASE + '/audit', { waitUntil: 'domcontentloaded' })
    await page.locator('main h1').first().waitFor({ timeout: 8000 })
    const h = (await page.locator('main h1').first().innerText()).trim()
    return /audit/i.test(h) && !/not found|404/i.test(h)
  } catch { return false } finally { await ctx.close() }
}

/* ------------------------------------------------------------------ run */
async function prepareSimulation() {
  log('Resetting and seeding the simulation ...')
  await api('POST', '/simulation/reset', { keep_rules: false })
  await api('POST', '/simulation/seed')
  const prev = await api('GET', '/live')
  await api('PUT', '/live', { enabled: true, rate: 4, attack_interval: 20 })
  log('Live feed on (rate 4/s, attack every ~20s). Waiting for charts to fill ...')
  const max = Number(process.env.WARMUP_MAX || 150) * 1000
  const t0 = Date.now()
  try {
    await poll(async () => {
      const [l, s] = await Promise.all([api('GET', '/live'), api('GET', '/stats/summary')])
      process.stdout.write(`\r  packets=${s.packets_total} alerts=${s.alerts_total} live attacks=${l.attacks}   `)
      return Date.now() - t0 > 25000 && l.attacks >= 2 && s.alerts_total >= 8 && s.packets_total >= 250
    }, { timeout: max, every: 1500, what: 'live data warm-up' })
    process.stdout.write('\n')
  } catch (e) {
    process.stdout.write('\n')
    console.warn(`WARN: ${e.message}; continuing with whatever data exists.`)
  }
  return prev
}

async function runPass(browser, theme, shots, results, dir, ctxState) {
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, colorScheme: theme, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  await setTheme(page, theme)
  page.on('pageerror', (e) => log(`   [pageerror] ${e.message}`))
  fs.mkdirSync(dir, { recursive: true })
  for (const shot of shots) {
    const file = path.join(dir, shot.file)
    let note = '', ok = false, lastErr
    for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
      try {
        await shot.run({ page, ctx: ctxState })
        await settle(page, { fast: !!shot.fast })
        note = await takeShot(page, shot, file)
        ok = true
      } catch (e) {
        lastErr = e
        log(`   attempt ${attempt} failed for ${shot.file}: ${e.message.split('\n')[0]}`)
        await page.keyboard.press('Escape').catch(() => {})
      }
    }
    if (shot.cleanup) await shot.cleanup({ page }).catch(() => {})
    const kb = ok ? Math.round(fs.statSync(file).size / 1024) : 0
    results.push({ shot, theme, ok, note, kb, error: ok ? '' : lastErr?.message.split('\n')[0] })
    log(`${ok ? 'OK  ' : 'FAIL'} [${theme}] ${shot.file}${ok ? `  ${note}, ${kb} KB` : `  ${lastErr?.message.split('\n')[0]}`}`)
  }
  await context.close()
}

function writeIndex(results, skipped) {
  const dark = results.filter((r) => r.theme === 'dark' && r.ok).sort((a, b) => a.shot.file.localeCompare(b.shot.file))
  const light = new Map(results.filter((r) => r.theme === 'light' && r.ok).map((r) => [r.shot.file, r]))
  const lines = [
    '# Sentinel screenshots', '',
    `Generated by \`qa/e2e/capture/capture-screenshots.mjs\` on ${new Date().toISOString().slice(0, 10)} against \`${BASE}\`.`,
    `Desktop viewport ${VIEW.width}x${VIEW.height}, device scale factor ${SCALE}. Dark theme in this folder; light theme variants in \`light/\`.`, '',
    '| File | Title | Caption | Light variant |', '|---|---|---|---|',
  ]
  for (const r of dark) {
    lines.push(`| \`${r.shot.file}\` | ${r.shot.title} | ${r.shot.caption} | ${light.has(r.shot.file) ? `\`light/${r.shot.file}\`` : ''} |`)
  }
  if (skipped.length) lines.push('', `Skipped (feature not present in this build): ${skipped.map((s) => `\`${s.file}\``).join(', ')}.`)
  lines.push('', '## Figure captions', '')
  dark.forEach((r, i) => lines.push(`- Figure ${i + 1}. ${r.shot.caption} (\`${r.shot.file}\`)`))
  lines.push('')
  fs.writeFileSync(path.join(OUT, 'INDEX.md'), lines.join('\n'))
}

async function main() {
  await preflight()
  fs.mkdirSync(OUT, { recursive: true })
  const launch = { headless: !process.env.HEADED }
  let browser
  try { browser = await chromium.launch(launch) } catch (e) {
    console.error(`ERROR: cannot launch Chromium (${e.message.split('\n')[0]}). Run: npx playwright install chromium`)
    process.exit(2)
  }
  const prevLive = await prepareSimulation()
  let exit = 0
  try {
    const hasAudit = await auditRouteExists(browser)
    log(hasAudit ? '/audit route found' : '/audit route not present in this build: audit shots skipped')
    const skipped = []
    let shots = SHOTS.filter((s) => {
      if (s.optional === 'audit' && !hasAudit) { skipped.push(s); return false }
      return !ONLY || ONLY.includes(s.id)
    })
    const results = []
    const state = {}
    log(`\nDark pass (${shots.length} shots) -> ${OUT}`)
    await runPass(browser, 'dark', shots, results, OUT, state)
    if (DO_LIGHT) {
      const ls = shots.filter((s) => s.light)
      log(`\nLight pass (${ls.length} shots) -> ${path.join(OUT, 'light')}`)
      await runPass(browser, 'light', ls, results, path.join(OUT, 'light'), state)
    }
    if (!ONLY) writeIndex(results, skipped)
    const bad = results.filter((r) => !r.ok)
    const badMandatory = bad.filter((r) => r.shot.mandatory)
    log(`\n${results.length - bad.length}/${results.length} captures ok, ${bad.length} failed (${badMandatory.length} mandatory).`)
    if (badMandatory.length) exit = 1
  } finally {
    if (!process.env.KEEP_LIVE) {
      await api('PUT', '/live', { enabled: prevLive.enabled, rate: prevLive.rate, attack_interval: prevLive.attack_interval }).catch(() => {})
      log('Live feed settings restored.')
    }
    await browser.close()
  }
  process.exit(exit)
}

main().catch((e) => { console.error(e); process.exit(1) })
