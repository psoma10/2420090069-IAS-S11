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

export interface ServerStatus {
  status: "ONLINE" | "OFFLINE";
  connected_clients: number;
  documents_received: number;
  documents_sent: number;
  successful_transfers: number;
  uptime_seconds: number;
}

export interface ActivityItem {
  id: number;
  message: string;
  created_at: string;
}

export interface DashboardData {
  documents_total: number;
  transfers_total: number;
  algorithms_available: number;
  successful_transfers: number;
  success_rate: number;
  server_status: ServerStatus["status"];
  recent_transfers: TransferSummary[];
  recent_activity: ActivityItem[];
}
