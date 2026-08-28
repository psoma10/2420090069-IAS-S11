import type { AlgorithmId } from "../../types/api";

const ALGORITHM_LABELS: Record<AlgorithmId, string> = {
  caesar: "Caesar",
  playfair: "Playfair",
  sdes: "SDES",
  aes: "AES",
};

export function algorithmLabel(id: AlgorithmId): string {
  return ALGORITHM_LABELS[id] ?? String(id).toUpperCase();
}

/** Bytes -> "8.7 KB". Formatting is the frontend's job per API_CONTRACT §6. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

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
