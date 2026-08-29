// Defensive normalisation for the two monitoring endpoints. src/types/api.ts
// now matches API_CONTRACT.md's actual wire shape, so this only guards
// against a malformed/partial response (missing fields, wrong types) —
// not against a documented shape mismatch.
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

export type NormalizedServerStatus = ServerStatus;

export function normalizeServerStatus(raw: unknown): NormalizedServerStatus {
  const record = asRecord(raw);
  // Fail safe: only an explicit "online" is reported as online. A missing or
  // unrecognised value means we cannot confirm the service is up, and a
  // monitor that claims online when it does not know is worse than useless.
  const status = asText(record.status).toLowerCase() === "online" ? "online" : "offline";

  return {
    status,
    connected_clients: asCount(record.connected_clients),
    documents_received: asCount(record.documents_received),
    documents_sent: asCount(record.documents_sent),
    successful_transfers: asCount(record.successful_transfers),
    failed_transfers: asCount(record.failed_transfers),
    uptime_seconds: asCount(record.uptime_seconds),
    recent_transfers: Array.isArray(record.recent_transfers)
      ? (record.recent_transfers as TransferSummary[])
      : [],
  };
}

const KNOWN_ACTIONS = new Set<string>([
  "USER_REGISTERED",
  "USER_LOGIN",
  "USER_LOGOUT",
  "DOCUMENT_UPLOADED",
  "DOCUMENT_ENCRYPTED",
  "TRANSFER_INITIATED",
  "TRANSFER_RECEIVED",
  "TRANSFER_COMPLETED",
  "TRANSFER_FAILED",
]);

/** Activity row per API_CONTRACT.md §3.7: `{ id, action, message, at }`. */
export function normalizeActivity(raw: unknown): ActivityItem[] {
  const record = asRecord(raw);
  const list = Array.isArray(record.activity) ? record.activity : Array.isArray(raw) ? raw : [];

  return list.map((entry, index) => {
    const item = asRecord(entry);
    const action = asText(item.action);
    return {
      id: typeof item.id === "number" ? item.id : index,
      action: (KNOWN_ACTIONS.has(action) ? action : "TRANSFER_INITIATED") as ActivityItem["action"],
      message: asText(item.message) || humanizeAction(action) || "Activity recorded",
      at: asText(item.at),
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
