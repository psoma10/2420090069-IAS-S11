import type { ApiErrorCode, ApiFailure, ApiSuccess } from "../types/api";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:5000";

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;

  constructor(message: string, code: ApiErrorCode, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  formData?: FormData;
  query?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${BASE_URL}/api${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Thin fetch wrapper around the CyberVault JSON API. Always sends
 * credentials so the Flask session cookie round-trips. Throws ApiError
 * on any non-success envelope or network failure — callers branch on
 * `error.code`, never on parsed message text.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, formData, query } = options;
  const url = buildUrl(path, query);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      credentials: "include",
      headers: formData ? undefined : { "Content-Type": "application/json" },
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError("Could not reach the CyberVault server.", "NETWORK_ERROR", 0);
  }

  let json: ApiSuccess<T> | ApiFailure;
  try {
    json = await response.json();
  } catch {
    throw new ApiError("The server returned an unreadable response.", "INTERNAL_ERROR", response.status);
  }

  if (!json.success) {
    throw new ApiError(json.message, json.error.code, response.status);
  }
  return json.data;
}

export const api = {
  auth: {
    register: (body: { name: string; email: string; password: string }) =>
      apiRequest("/auth/register", { method: "POST", body }),
    login: (body: { email: string; password: string }) =>
      apiRequest("/auth/login", { method: "POST", body }),
    logout: () => apiRequest("/auth/logout", { method: "POST" }),
    me: () => apiRequest("/auth/me"),
  },
  algorithms: {
    list: () => apiRequest("/algorithms"),
    generateKey: (id: string, keySize?: number) =>
      apiRequest(`/algorithms/${id}/key`, { method: "POST", body: keySize ? { key_size: keySize } : {} }),
  },
  encryption: {
    preview: (body: { algorithm: string; key: string; text: string }) =>
      apiRequest("/encryption/preview", { method: "POST", body }),
    decryptPreview: (body: { algorithm: string; key: string; ciphertext: string }) =>
      apiRequest("/encryption/decrypt-preview", { method: "POST", body }),
  },
  documents: {
    upload: (formData: FormData) => apiRequest("/documents", { method: "POST", formData }),
    list: (query?: { direction?: string; status?: string; limit?: number; offset?: number }) =>
      apiRequest("/documents", { query }),
    get: (id: number) => apiRequest(`/documents/${id}`),
    downloadUrl: (id: number) => buildUrl(`/documents/${id}/download`),
  },
  transfers: {
    create: (body: { document_id: number; algorithm: string; key: string; direction?: string }) =>
      apiRequest("/transfers", { method: "POST", body }),
    list: (query?: { direction?: string; status?: string; limit?: number; offset?: number }) =>
      apiRequest("/transfers", { query }),
    get: (id: number | string) => apiRequest(`/transfers/${id}`),
    decrypt: (id: number | string, key?: string) =>
      apiRequest(`/transfers/${id}/decrypt`, { method: "POST", body: key ? { key } : {} }),
  },
  dashboard: {
    get: () => apiRequest("/dashboard"),
  },
  server: {
    status: () => apiRequest("/server/status"),
  },
  activity: {
    list: () => apiRequest("/activity"),
  },
};
