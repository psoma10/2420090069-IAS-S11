# Documentation screenshot capture

`capture-screenshots.mjs` produces the figure set for the project documentation: desktop only
(viewport 1920x1080, device scale factor 1), dark theme in `output/`, a light-theme subset in `output/light/`,
and `output/INDEX.md` with one caption per file (generated from the same `SHOTS` table in the script, so file
names and captions cannot drift).

## Run

Servers must already be running (backend on 48731, Vite on 48732 by default):

```bash
cd qa/e2e && npm install && npx playwright install chromium   # first time only
node capture/capture-screenshots.mjs
# or, against other ports / another output folder
BASE_URL=http://localhost:48901 API=http://localhost:48900 OUT=../../output node capture/capture-screenshots.mjs
```

| Env | Default | Meaning |
|---|---|---|
| `BASE_URL` | `http://localhost:48732` | Frontend (must proxy `/api` to the backend) |
| `API` | `http://localhost:48731` | Backend |
| `OUT` | `<repo>/output` | Output folder |
| `ONLY` | all | Comma list of shot ids, e.g. `ONLY=01,05` (INDEX.md is not rewritten) |
| `LIGHT` | on | `LIGHT=0` skips the light pass |
| `SCALE` | `1` | `deviceScaleFactor` (2 doubles pixel size; files stay under ~1.5 MB) |
| `KEEP_LIVE` | off | Leave the live feed at the capture settings instead of restoring the previous ones |
| `WARMUP_MAX` | `150` | Max seconds to wait for the live feed to fill charts |
| `HEADED` | off | Show the browser |

Exit code: `0` ok, `1` a mandatory shot failed (each shot is retried once), `2` a server or Chromium is missing.

## What it does

1. Pre-flight: backend, frontend and the frontend-to-API proxy must answer, otherwise a clear error and exit 2.
2. `POST /simulation/reset {keep_rules:false}` then `/simulation/seed` (known-good lab), then `PUT /live`
   `{enabled:true, rate:4, attack_interval:20}` and polls until at least 2 live attacks, 8 alerts and 250 packets
   exist (and at least 25 s have passed), so the charts hold real data. The previous live settings are restored at the end.
3. Dark pass over all shots, then light pass over the shots marked `light: true`.
4. Every shot waits on explicit selectors (page heading, the sidebar chip `Live`, charts drawn, no spinners,
   fonts loaded) and then a short fixed pause, because recharts animates in JavaScript. Screenshots are taken with
   CSS animations frozen, the mouse parked and focus removed.

## Full-height shots

The app scrolls the window, with a sticky sidebar. When a page is taller than 1080 px the script temporarily grows
the viewport to the page height (capped at 3200 px) so the sidebar and top bar span the whole image, then restores
1920x1080. Fixed-size shots (`tall: false`: dialogs, command palette, toast, audit tables, topbar crop) are always exactly
1920x1080 (the topbar strip is 1920x72). Pages that fit in one screen (`09-guided-labs`, `09b`) are plain viewport shots.
`INDEX.md` does not list pixel sizes; the console log does.

## Shots

Numbered `01`..`19`: overview, alerts, anomaly, firewall (+ add-rule dialog), hosts with bastion mode enforced,
traffic generator (+ scenario result stream), detection rules, investigate (the attacker IP that tripped the most
different detections), labs (+ an open lab), encyclopedia (+ an article), settings (live traffic feed panel),
command palette, about, and "story" shots of real-time behaviour: `16` overview before a DDoS, `17` after it,
`18` the alert toast after a port-scan launch, `19` the top bar with "Live feed: On".
`14-audit-log` and `15-audit-log-security` are captured only if `/audit` exists in the running build
(detected by opening the route and checking the page heading); otherwise they are skipped and noted in INDEX.md.

To add or change a shot edit the `SHOTS` array; set `mandatory`, `light`, `tall:false` or `clip` as needed.
The script changes the simulation state of the server it targets (reset, seed, bastion mode on, rules not kept),
so point it at a throwaway database (`SENTINEL_DB=<file>`) rather than data you care about.
