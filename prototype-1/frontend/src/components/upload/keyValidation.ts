import type { Algorithm } from "../../types/api";

/**
 * Validates a key against the algorithm's documented format
 * (API_CONTRACT.md 3.2 `key_format`). Returns undefined when acceptable.
 * The server re-checks; this exists to fail fast with a specific message.
 */
export function validateKey(algorithm: Algorithm | null, key: string, keySize: number): string | undefined {
  if (!algorithm) return undefined;
  const trimmed = key.trim();
  if (!trimmed) return "Enter a key, or generate one.";

  switch (algorithm.id) {
    case "caesar": {
      if (!/^\d+$/.test(trimmed)) return "Caesar keys are a whole number shift, for example 3.";
      const shift = Number(trimmed);
      if (shift < 0 || shift > 25) return `Shift must be between 0 and 25 — ${shift} is out of range.`;
      return undefined;
    }
    case "playfair":
      if (!/^[A-Za-z]+$/.test(trimmed)) return "Playfair keys use letters only, with no spaces, digits or symbols.";
      return undefined;
    case "sdes":
      if (!/^[01]+$/.test(trimmed)) return "SDES keys are binary — use only the digits 0 and 1.";
      if (trimmed.length !== 10) return `SDES keys are exactly 10 bits — this one is ${trimmed.length}.`;
      return undefined;
    case "aes": {
      if (!/^[0-9a-fA-F]+$/.test(trimmed)) return "AES keys are hexadecimal — use characters 0-9 and a-f only.";
      const expected = keySize / 4; // 128 -> 32 hex chars, 192 -> 48, 256 -> 64.
      if (trimmed.length !== expected) {
        return `AES-${keySize} needs exactly ${expected} hex characters — this one has ${trimmed.length}.`;
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

