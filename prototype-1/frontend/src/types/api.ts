// Types mirroring prototype-1/backend/API_CONTRACT.md. Keep in sync with that
// doc, not with backend source — the contract is the interface boundary.

export interface ApiSuccess<T> {
  success: true;
  message: string;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  error: { code: ApiErrorCode };
}

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "EMAIL_TAKEN"
  | "INVALID_CREDENTIALS"
  | "UNAUTHORIZED"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_TYPE"
  | "EMPTY_FILE"
  | "DOCUMENT_NOT_FOUND"
  | "TRANSFER_NOT_FOUND"
  | "UNSUPPORTED_ALGORITHM"
  | "INVALID_KEY"
  | "ENCRYPTION_FAILED"
  | "DECRYPTION_FAILED"
  | "TRANSFER_FAILED"
  | "INVALID_STATE"
  | "SERVER_UNAVAILABLE"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR"; // client-side synthetic code for fetch rejection

export interface User {
  id: number;
  name: string;
  email: string;
  created_at: string;
}

export type AlgorithmId = "caesar" | "playfair" | "sdes" | "aes";
export type AlgorithmType = "classical" | "educational" | "modern";

export interface Algorithm {
  id: AlgorithmId;
  name: string;
  type: AlgorithmType;
  description: string;
  key_format: string;
  key_sizes: number[];
  supports_generate: boolean;
}

export type Direction = "CLIENT_TO_SERVER" | "SERVER_TO_CLIENT";
export type DocumentStatus = "UPLOADED" | "ENCRYPTED" | "TRANSFERRED";

export interface DocumentSummary {
  id: number;
  filename: string;
  size: number;
  algorithm: AlgorithmId | null;
  direction: Direction;
  status: DocumentStatus;
  created_at: string;
}

export interface DocumentDetail extends DocumentSummary {
  content: string;
  preview: string;
}

export type TransferStageName = "ENCRYPTING" | "TRANSMITTING" | "RECEIVED" | "DECRYPTING" | "COMPLETED";

export interface TransferStage {
  stage: TransferStageName;
  status: "pending" | "active" | "done" | "failed";
  at: string | null;
}

export type TransferStatus = "PENDING" | "RECEIVED" | "COMPLETED" | "FAILED";

export interface TransferSummary {
  transfer_id: string;
  id: number;
  status: TransferStatus;
  document_id: number;
  filename: string;
  algorithm: AlgorithmId;
  direction: Direction;
  sender: string;
  receiver: string;
  plaintext_size: number;
  encrypted_size: number;
  encryption_time_ms: number;
  timestamp: string;
}

export interface TransferDetail extends TransferSummary {
  stages: TransferStage[];
  ciphertext: string;
  ciphertext_preview: string;
  decrypted_content?: string;
}

export interface DecryptResult {
  transfer_id: string;
  status: TransferStatus;
  plaintext: string;
  plaintext_size: number;
  decryption_time_ms: number;
  integrity_verified: boolean | null;
  stages: TransferStage[];
}

export interface EncryptionPreview {
  algorithm: AlgorithmId;
  algorithm_label: string;
  plaintext: string;
  ciphertext: string;
  plaintext_size: number;
  ciphertext_size: number;
  encryption_time_ms: number;
}

export interface DecryptPreview {
  algorithm: AlgorithmId;
  algorithm_label: string;
  ciphertext: string;
  plaintext: string;
  plaintext_size: number;
  decryption_time_ms: number;
}

// API_CONTRACT.md §3.6 — the backend sends lowercase status and includes
// failed_transfers/recent_transfers; earlier drafts of this type guessed
// uppercase and omitted both fields.
export interface ServerStatus {
  status: "online" | "offline";
  connected_clients: number;
  documents_received: number;
  documents_sent: number;
  successful_transfers: number;
  failed_transfers: number;
  uptime_seconds: number;
  recent_transfers: TransferSummary[];
}

// API_CONTRACT.md §3.9 — a share link is the owner-facing record of a public
// URL. `token` is the visitor's only credential, so it is never rendered
// anywhere except inside the copyable link itself.
export interface ShareLink {
  id: number;
  document_id: number;
  /** Null on the DELETE response, which returns the share without its document join. */
  filename: string | null;
  token: string;
  /** Server-built path, e.g. "/share/<token>". Combine with location.origin for the full URL. */
  share_path: string;
  label: string | null;
  revoked: boolean;
  expired: boolean;
  /** Server's verdict: !revoked && !expired. Trust this over recomputing client-side. */
  active: boolean;
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
}

export interface ShareLinkList {
  shares: ShareLink[];
  total: number;
}

// API_CONTRACT.md §3.9 — the public payload is deliberately narrow: no
// account details, no ciphertext, no keys, no route to other documents.
export interface SharedDocument {
  filename: string;
  size: number;
  content: string;
  algorithm: AlgorithmId | null;
  shared_by: string;
  shared_at: string;
  expires_at: string | null;
  label: string | null;
}

export type ActivityAction =
  | "USER_REGISTERED"
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_ENCRYPTED"
  | "TRANSFER_INITIATED"
  | "TRANSFER_RECEIVED"
  | "TRANSFER_COMPLETED"
  | "TRANSFER_FAILED";

// API_CONTRACT.md §3.7 — the wire shape is {id, action, message, at}, not
// the {message, created_at} some pages were built against.
export interface ActivityItem {
  id: number;
  action: ActivityAction;
  message: string;
  at: string;
}

// API_CONTRACT.md §3.6 — field names are documents/transfers/algorithms,
// not the *_total/_available suffixes this type originally guessed.
export interface DashboardData {
  documents: number;
  transfers: number;
  encrypted_documents: number;
  algorithms: number;
  successful_transfers: number;
  failed_transfers: number;
  success_rate: number;
  server_status: ServerStatus["status"];
  recent_transfers: TransferSummary[];
  recent_activity: ActivityItem[];
}
