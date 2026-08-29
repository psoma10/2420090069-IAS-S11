// algorithmLabel and formatBytes live in src/lib/format.ts — the canonical
// copy every screen shares — and are re-exported here so existing imports
// from this module keep working.
export { formatAlgorithm as algorithmLabel, formatBytes } from "../../lib/format";

/** Compact relative time: "just now", "4m ago", "3h ago", "2d ago". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 0) return "just now";
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Absolute timestamp for the `title`/`dateTime` attribute on relative labels. */
export function absoluteTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}
