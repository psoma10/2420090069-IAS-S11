import { useSyncExternalStore } from 'react'

const KEY = 'sentinel.theme'
const listeners = new Set()

function systemTheme() {
  try { return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark' } catch { return 'dark' }
}
/** Stored preference: 'light' | 'dark' | 'system'. */
export function getPreference() {
  try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : 'system' } catch { return 'system' }
}
export function resolveTheme(pref = getPreference()) {
  return pref === 'system' ? systemTheme() : pref
}
function apply() {
  document.documentElement.setAttribute('data-theme', resolveTheme())
  listeners.forEach((l) => l())
}
export function setPreference(pref) {
  try { if (pref === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref) } catch { /* ignore */ }
  apply()
}
export function toggleTheme() {
  setPreference(resolveTheme() === 'light' ? 'dark' : 'light')
}
try {
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (getPreference() === 'system') apply() })
} catch { /* ignore */ }

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l) }
/** { theme: resolved 'light'|'dark', preference, setPreference, toggle } */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.getAttribute('data-theme') || 'dark', () => 'dark')
  const preference = useSyncExternalStore(subscribe, getPreference, () => 'system')
  return { theme, preference, setPreference, toggle: toggleTheme }
}
