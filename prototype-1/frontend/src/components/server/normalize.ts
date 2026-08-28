// Defensive normalisation for the two monitoring endpoints.
//
// API_CONTRACT.md and src/types/api.ts disagree on wire shape today:
//   - status:   contract says "online" (lowercase), types say "ONLINE"
//   - activity: contract says { action, at }, types say { message, created_at }
//   - contract additionally returns failed_transfers + recent_transfers,
//     neither of which exists on the ServerStatus type.
// Rather than pick a winner and render blanks when the backend disagrees,
// these readers accept either shape and coerce to the typed form. Delete the
// fallbacks once the contract and the types are reconciled.
import type { ActivityItem, ServerStatus, TransferSummary } from "../../types/api";

type Loose = Record<string, unknown>;

function asRecord(value: unknown): Loose {
  return value && typeof value === "object" ? (value as Loose) : {};
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Server status, tolerant of casing and of the extra contract-only fields. */
export interface NormalizedServerStatus extends ServerStatus {
  failed_transfers: number;
  recent_transfers: TransferSummary[];
}

export function normalizeServerStatus(raw: unknown): NormalizedServerStatus {
  const record = asRecord(raw);
  // Fail safe: only an explicit "online" is reported as ONLINE. A missing or
  // unrecognised value means we cannot confirm the service is up, and a
  // monitor that claims ONLINE when it does not know is worse than useless.
  const status = asText(record.status).toUpperCase() === "ONLINE" ? "ONLINE" : "OFFLINE";

  return {
    status,
    connected_clients: asCount(record.connected_clients),
    documents_received: asCount(record.documents_received),
    documents_sent: asCount(record.documents_sent),
    successful_transfers: asCount(record.successful_transfers),
    uptime_seconds: asCount(record.uptime_seconds),
    failed_transfers: asCount(record.failed_transfers),
    recent_transfers: Array.isArray(record.recent_transfers)
      ? (record.recent_transfers as TransferSummary[])
      : [],
  };
}

/** Activity row, accepting either `{ message, created_at }` or `{ action, at }`. */
export function normalizeActivity(raw: unknown): ActivityItem[] {
  const record = asRecord(raw);
  const list = Array.isArray(record.activity) ? record.activity : Array.isArray(raw) ? raw : [];

  return list.map((entry, index) => {
    const item = asRecord(entry);
    const message = asText(item.message) || humanizeAction(asText(item.action)) || "Activity recorded";
    return {
      id: typeof item.id === "number" ? item.id : index,
      message,
      created_at: asText(item.created_at) || asText(item.at),
    };
  });
}

export function activityTotal(raw: unknown, fallback: number): number {
  const total = asRecord(raw).total;
  return typeof total === "number" ? total : fallback;
}

/**
 * `TRANSFER_COMPLETED` -> `Transfer completed`. Only used when the backend
 * omits `message`; the contract says `message` is the human-facing string.
 */
function humanizeAction(action: string): string {
  if (!action) return "";
  const words = action.toLowerCase().split("_").filter(Boolean);
  if (words.length === 0) return "";
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
}
