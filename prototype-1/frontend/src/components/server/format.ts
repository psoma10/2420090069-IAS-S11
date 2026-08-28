// Presentation helpers shared by the Server Monitor and Activity screens.
// Per API_CONTRACT.md section 6, byte/duration formatting is the frontend's job.

/** 8704 -> "8.5 KB". Binary units, one decimal above the KB threshold. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/** 5423 -> "1h 30m". Ops dashboards read uptime at a glance, not to the second. */
export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/**
 * Zero-padded counter, matching the PRD FR-08 mock ("CONNECTED CLIENTS  03").
 * Padding stops at 2 digits so real three-digit counts are not truncated.
 */
export function padCount(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return safe < 10 ? `0${safe}` : String(safe);
}

/** "12:33" — the PRD section 18 activity-log timestamp format. */
export function formatClock(iso: string): string {
  const date = parseIso(iso);
  if (!date) return "--:--";
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** "12:33:04" — used where ordering within a minute matters. */
export function formatClockSeconds(iso: string): string {
  const date = parseIso(iso);
  if (!date) return "--:--:--";
  return `${formatClock(iso)}:${String(date.getSeconds()).padStart(2, "0")}`;
}

/** "Today", "Yesterday", or "29 Aug 2026" — the activity day-group heading. */
export function formatDayLabel(iso: string): string {
  const date = parseIso(iso);
  if (!date) return "Unknown date";

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86400000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Stable YYYY-MM-DD key for grouping, independent of the display label. */
export function dayKey(iso: string): string {
  const date = parseIso(iso);
  if (!date) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Full timestamp for `title`/`dateTime` attributes so hover reveals precision. */
export function formatAbsolute(iso: string): string {
  const date = parseIso(iso);
  if (!date) return "Unknown time";
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** "just now" / "4m ago" — relative age for the "last checked" affordance. */
export function formatRelative(iso: string): string {
  const date = parseIso(iso);
  if (!date) return "unknown";
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Backend sends ISO-8601 UTC with trailing Z; guard against malformed values. */
function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const ALGORITHM_LABELS: Record<string, string> = {
  caesar: "Caesar",
  playfair: "Playfair",
  sdes: "SDES",
  aes: "AES-256",
};

/** Lowercase algorithm ids -> the display labels used across the product. */
export function algorithmLabel(id: string): string {
  return ALGORITHM_LABELS[id] ?? id.toUpperCase();
}
