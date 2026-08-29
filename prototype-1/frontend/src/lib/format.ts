// Shared display formatters for dense data views (documents, transfers).
// Kept pure and dependency-free so table cells stay cheap to render.
import type { AlgorithmId, Direction, DocumentStatus, TransferStatus } from "../types/api";

/** Bytes -> "8.7 KB" using the PRD's KB convention (1024 B). Sub-KB shows bytes. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/** Exact byte count for detail panels, e.g. "8,704 bytes" (PRD FR-12). */
export function formatBytesExact(bytes: number): string {
  return `${bytes.toLocaleString("en-US")} bytes`;
}

const DATE_TIME: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
};

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", DATE_TIME).format(date);
}

/** Machine-readable value for <time dateTime>. Falls back to the raw string. */
export function toDateTimeAttr(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toISOString();
}

// PRD FR-08's Recent Transfers mock spells this "AES-256", and that's the
// more informative label (it's the recommended key size per FR-05) — used
// everywhere rather than the plain "AES" some screens had drifted to.
const ALGORITHM_LABELS: Record<AlgorithmId, string> = {
  caesar: "Caesar",
  playfair: "Playfair",
  sdes: "SDES",
  aes: "AES-256",
};

export function formatAlgorithm(id: AlgorithmId | string | null): string {
  if (!id) return "—";
  return ALGORITHM_LABELS[id as AlgorithmId] ?? String(id).toUpperCase();
}

/** @deprecated Alias of {@link formatAlgorithm} — kept while call sites migrate. */
export const algorithmLabel = formatAlgorithm;

const DIRECTION_LABELS: Record<Direction, string> = {
  CLIENT_TO_SERVER: "Client → Server",
  SERVER_TO_CLIENT: "Server → Client",
};

export function formatDirection(direction: Direction): string {
  return DIRECTION_LABELS[direction] ?? direction;
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

/** Transfer status -> Badge tone. COMPLETED reads as success, FAILED as danger. */
export function transferStatusTone(status: TransferStatus): Tone {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
      return "danger";
    case "RECEIVED":
      return "info";
    case "PENDING":
      return "warning";
    default:
      return "neutral";
  }
}

export function documentStatusTone(status: DocumentStatus): Tone {
  switch (status) {
    case "TRANSFERRED":
      return "success";
    case "ENCRYPTED":
      return "accent";
    case "UPLOADED":
      return "neutral";
    default:
      return "neutral";
  }
}

/** Direction badges stay low-contrast — they are a dimension, not a state. */
export function directionTone(direction: Direction): Tone {
  return direction === "CLIENT_TO_SERVER" ? "accent" : "info";
}

/** Title-cases an ALL_CAPS enum for display: "TRANSFERRED" -> "Transferred". */
export function titleCaseStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
