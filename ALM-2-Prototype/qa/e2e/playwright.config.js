import { defineConfig } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')

const FE_PORT = process.env.SENTINEL_FE_PORT || '48732'
const API_PORT = process.env.SENTINEL_API_PORT || '48731'
const BASE_URL = process.env.BASE_URL || `http://127.0.0.1:${FE_PORT}`
const API_URL = process.env.API_URL || `http://127.0.0.1:${API_PORT}`

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: BASE_URL, viewport: { width: 1440, height: 900 } },
  webServer: [
    {
      command: `"${path.join(root, 'backend/.venv/Scripts/python.exe')}" -m uvicorn app.main:app --host 127.0.0.1 --port ${API_PORT}`,
      cwd: path.join(root, 'backend'),
      url: `${API_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${FE_PORT}`,
      cwd: path.join(root, 'frontend'),
      env: { ...process.env, SENTINEL_API_PORT: API_PORT, SENTINEL_FE_PORT: FE_PORT },
      url: BASE_URL,
      reuseExistingServer: true,
      timeout: 90_000,
    },
  ],
})
