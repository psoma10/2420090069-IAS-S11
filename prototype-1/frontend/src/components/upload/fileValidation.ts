import type { Direction } from "../../types/api";

/**
 * Client-side mirror of the server's upload rules (API_CONTRACT.md 3.4).
 *
 * This never replaces server validation — it front-runs it, so an oversized
 * or wrong-typed file is rejected instantly instead of after a round trip
 * that would fail anyway. The limits below must stay in step with the
 * contract; they are the same numbers the backend enforces.
 */

export const SIZE_LIMITS: Record<Direction, number> = {
  CLIENT_TO_SERVER: 10240, // 10 KB
  SERVER_TO_CLIENT: 5120, //  5 KB
};

export const ACCEPT = ".txt,text/plain";

export type RejectionCode = "INVALID_FILE_TYPE" | "FILE_TOO_LARGE" | "EMPTY_FILE";

export interface Rejection {
  code: RejectionCode;
  /** Short heading, PRD section 17 phrasing. */
  title: string;
  /** Full sentence naming the concrete problem and the fix. */
  message: string;
}

/** "8.7 KB" / "412 B", matching lib/format.ts conventions (1024 B per KB). */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function limitFor(direction: Direction): number {
  return SIZE_LIMITS[direction];
}

function hasTxtExtension(name: string): boolean {
  return name.toLowerCase().endsWith(".txt");
}

/**
 * Validates by extension AND mime where available. Browsers report an empty
 * `type` for some .txt files depending on OS registry state, so extension is
 * the primary signal and mime only ever used to reject an obvious mismatch.
 */
export function validateFile(file: File, direction: Direction): Rejection | null {
  if (!hasTxtExtension(file.name)) {
    return {
      code: "INVALID_FILE_TYPE",
      title: "Invalid document",
      message: `"${file.name}" is not a .txt file. Only human-readable .txt files are supported by this prototype.`,
    };
  }

  if (file.type && file.type !== "text/plain") {
    return {
      code: "INVALID_FILE_TYPE",
      title: "Invalid document",
      message: `"${file.name}" reports the type "${file.type}". Only plain-text .txt files are supported.`,
    };
  }

  if (file.size === 0) {
    return {
      code: "EMPTY_FILE",
      title: "Empty document",
      message: `"${file.name}" is empty. Select a document that contains text.`,
    };
  }

  const limit = limitFor(direction);
  if (file.size > limit) {
    return {
      code: "FILE_TOO_LARGE",
      title: "Upload failed",
      message: `File size ${formatSize(file.size)} exceeds the ${formatSize(limit)} maximum for ${
        direction === "CLIENT_TO_SERVER" ? "client to server" : "server to client"
      } transfers. Please select a smaller file.`,
    };
  }

  return null;
}

/**
 * The contract also requires the file be UTF-8 decodable. Reading it here
 * lets us catch a binary file renamed to .txt before uploading, and gives
 * the preview screen its plaintext without a second read.
 */
export async function readTextFile(file: File): Promise<{ text: string } | { rejection: Rejection }> {
  try {
    const buffer = await file.arrayBuffer();
    // fatal:true makes the decoder throw on invalid byte sequences rather
    // than silently substituting U+FFFD replacement characters.
    const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    if (!text.trim()) {
      return {
        rejection: {
          code: "EMPTY_FILE",
          title: "Empty document",
          message: `"${file.name}" contains no readable text. Select a document with content in it.`,
        },
      };
    }
    return { text };
  } catch {
    return {
      rejection: {
        code: "INVALID_FILE_TYPE",
        title: "Invalid document",
        message: `"${file.name}" is not valid UTF-8 text. Only human-readable .txt files are supported.`,
      },
    };
  }
}

/** True when a drag payload plausibly contains a .txt file. */
export function dragLooksAcceptable(event: React.DragEvent): boolean {
  const items = Array.from(event.dataTransfer?.items ?? []);
  if (items.length === 0) return true; // Unknown during dragover — stay neutral.
  return items.some((item) => item.kind === "file" && (item.type === "" || item.type === "text/plain"));
}
