// Contract-shaped sample data so pages render real layouts and Playwright
// agents can inspect/screenshot real UI before the backend is runnable
// end-to-end. Each page should attempt the live API first and fall back
// to this only on NETWORK_ERROR / SERVER_UNAVAILABLE — never mask other
// errors (auth failures, validation) behind mock data.
import type {
  Algorithm,
  DashboardData,
  DocumentSummary,
  ServerStatus,
  TransferDetail,
  TransferSummary,
  User,
} from "../types/api";

export const MOCK_USER: User = {
  id: 1,
  name: "Pujith Krishna Soma",
  email: "pujith@example.com",
  created_at: "2026-08-20T09:00:00Z",
};

export const MOCK_ALGORITHMS: Algorithm[] = [
  {
    id: "caesar",
    name: "Caesar Cipher",
    type: "classical",
    description: "Classical substitution cipher using character shifting.",
    key_format: "Integer shift from 0 to 25",
    key_sizes: [],
    supports_generate: true,
  },
  {
    id: "playfair",
    name: "Playfair Cipher",
    type: "classical",
    description: "Classical digraph substitution cipher using a 5x5 key square.",
    key_format: "Alphabetic keyword, letters only",
    key_sizes: [],
    supports_generate: true,
  },
  {
    id: "sdes",
    name: "SDES",
    type: "educational",
    description: "Simplified Data Encryption Standard, for educational demonstration.",
    key_format: "10-bit binary string, e.g. 1010000010",
    key_sizes: [],
    supports_generate: true,
  },
  {
    id: "aes",
    name: "AES",
    type: "modern",
    description: "Modern symmetric block cipher in authenticated EAX mode.",
    key_format: "Hex string: 32, 48 or 64 characters",
    key_sizes: [128, 192, 256],
    supports_generate: true,
  },
];

export const MOCK_SERVER_STATUS: ServerStatus = {
  status: "online",
  connected_clients: 3,
  documents_received: 18,
  documents_sent: 12,
  successful_transfers: 30,
  failed_transfers: 1,
  uptime_seconds: 5423,
  recent_transfers: [],
};

export const MOCK_TRANSFERS: TransferSummary[] = [
  {
    transfer_id: "TR-000123",
    id: 123,
    status: "COMPLETED",
    document_id: 7,
    filename: "confidential.txt",
    algorithm: "aes",
    direction: "CLIENT_TO_SERVER",
    sender: "client",
    receiver: "server",
    plaintext_size: 8704,
    encrypted_size: 11624,
    encryption_time_ms: 1.83,
    timestamp: "2026-08-29T10:15:02Z",
  },
  {
    transfer_id: "TR-000122",
    id: 122,
    status: "COMPLETED",
    document_id: 6,
    filename: "notes.txt",
    algorithm: "sdes",
    direction: "CLIENT_TO_SERVER",
    sender: "client",
    receiver: "server",
    plaintext_size: 4300,
    encrypted_size: 4300,
    encryption_time_ms: 0.9,
    timestamp: "2026-08-29T09:58:11Z",
  },
  {
    transfer_id: "TR-000121",
    id: 121,
    status: "COMPLETED",
    document_id: 5,
    filename: "server_report.txt",
    algorithm: "aes",
    direction: "SERVER_TO_CLIENT",
    sender: "server",
    receiver: "client",
    plaintext_size: 4915,
    encrypted_size: 5820,
    encryption_time_ms: 1.12,
    timestamp: "2026-08-29T09:40:03Z",
  },
];

export const MOCK_TRANSFER_DETAIL: TransferDetail = {
  ...MOCK_TRANSFERS[0],
  stages: [
    { stage: "ENCRYPTING", status: "done", at: "2026-08-29T10:15:02.100Z" },
    { stage: "TRANSMITTING", status: "done", at: "2026-08-29T10:15:02.110Z" },
    { stage: "RECEIVED", status: "done", at: "2026-08-29T10:15:02.121Z" },
    { stage: "DECRYPTING", status: "done", at: "2026-08-29T10:15:02.130Z" },
    { stage: "COMPLETED", status: "done", at: "2026-08-29T10:15:02.140Z" },
  ],
  ciphertext: "8F72A91C3D8E...B192AC77D3A1...92C81F72A...",
  ciphertext_preview: "8F72A91C3D8E...B192AC77D3A1...92C81F72A...",
  decrypted_content: "This document contains confidential information for secure transmission.",
};

export const MOCK_DOCUMENTS: DocumentSummary[] = [
  { id: 7, filename: "confidential.txt", size: 8704, algorithm: "aes", direction: "CLIENT_TO_SERVER", status: "TRANSFERRED", created_at: "2026-08-29T10:14:31Z" },
  { id: 6, filename: "notes.txt", size: 4300, algorithm: "sdes", direction: "CLIENT_TO_SERVER", status: "TRANSFERRED", created_at: "2026-08-29T09:57:20Z" },
  { id: 5, filename: "server_report.txt", size: 4915, algorithm: "aes", direction: "SERVER_TO_CLIENT", status: "TRANSFERRED", created_at: "2026-08-29T09:39:10Z" },
];

export const MOCK_DASHBOARD: DashboardData = {
  documents: 24,
  transfers: 18,
  encrypted_documents: 18,
  algorithms: 4,
  successful_transfers: 18,
  failed_transfers: 0,
  success_rate: 100,
  server_status: "online",
  recent_transfers: MOCK_TRANSFERS,
  recent_activity: [
    { id: 1, action: "DOCUMENT_ENCRYPTED", message: "Document encrypted", at: "2026-08-29T12:32:00Z" },
    { id: 2, action: "TRANSFER_INITIATED", message: "Transfer initiated", at: "2026-08-29T12:33:00Z" },
    { id: 3, action: "TRANSFER_RECEIVED", message: "Server received ciphertext", at: "2026-08-29T12:33:05Z" },
    { id: 4, action: "TRANSFER_COMPLETED", message: "Document decrypted", at: "2026-08-29T12:33:10Z" },
  ],
};
