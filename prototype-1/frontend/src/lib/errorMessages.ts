import type { ApiErrorCode } from "../types/api";
import { ApiError } from "./api";

/**
 * Canonical, human-facing copy for every backend error code.
 *
 * Why this exists: the API envelope's `message` is written for developers and
 * varies per endpoint ("File exceeds the 10 KB limit"). The PRD (section 17)
 * specifies exact user-facing wording for the four headline failures, and
 * section 8 requires "clear error and success messages" everywhere else.
 * This module is the single place that copy lives.
 *
 * Usage:
 *   import { getErrorMessage, errorTitle } from "../lib/errorMessages";
 *   catch (err) {
 *     if (err instanceof ApiError) setError(getErrorMessage(err.code, err.message));
 *   }
 * Or, more simply, use the ApiError-aware helper:
 *   catch (err) { setError(describeError(err)); }
 */

/**
 * Short ALL-CAPS heading for an error, matching the PRD section 17 blocks
 * ("UPLOAD FAILED", "DECRYPTION FAILED", "SERVER OFFLINE", "INVALID DOCUMENT").
 * Pair this with getErrorMessage() when you have room for a two-line banner.
 */
export function getErrorTitle(code: ApiErrorCode): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return "CHECK YOUR INPUT";
    case "EMAIL_TAKEN":
      return "EMAIL ALREADY REGISTERED";
    case "INVALID_CREDENTIALS":
      return "LOGIN FAILED";
    case "UNAUTHORIZED":
      return "SESSION EXPIRED";
    case "FILE_TOO_LARGE":
      return "UPLOAD FAILED";
    case "INVALID_FILE_TYPE":
      return "INVALID DOCUMENT";
    case "EMPTY_FILE":
      return "EMPTY DOCUMENT";
    case "DOCUMENT_NOT_FOUND":
      return "DOCUMENT NOT FOUND";
    case "TRANSFER_NOT_FOUND":
      return "TRANSFER NOT FOUND";
    case "UNSUPPORTED_ALGORITHM":
      return "UNSUPPORTED ALGORITHM";
    case "INVALID_KEY":
      return "INVALID KEY";
    case "ENCRYPTION_FAILED":
      return "ENCRYPTION FAILED";
    case "DECRYPTION_FAILED":
      return "DECRYPTION FAILED";
    case "TRANSFER_FAILED":
      return "TRANSFER FAILED";
    case "INVALID_STATE":
      return "ACTION UNAVAILABLE";
    case "SERVER_UNAVAILABLE":
      return "SERVER OFFLINE";
    case "NETWORK_ERROR":
      return "SERVER OFFLINE";
    case "INTERNAL_ERROR":
      return "SOMETHING WENT WRONG";
    default: {
      // Exhaustiveness guard: adding a code to ApiErrorCode without a title
      // here is a compile error, not a runtime surprise.
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/**
 * Full sentence explaining the failure and, where possible, what to do next.
 *
 * @param code     stable error code from ApiError.code
 * @param fallback server-supplied message, used for codes whose detail is
 *                 endpoint-specific (e.g. VALIDATION_ERROR names the field,
 *                 FILE_TOO_LARGE names the actual size vs the limit)
 */
export function getErrorMessage(code: ApiErrorCode, fallback: string): string {
  switch (code) {
    // --- Auth / validation -------------------------------------------------
    case "VALIDATION_ERROR":
      // The server knows which field failed; its message is more useful.
      return fallback || "Some of the details supplied are incomplete or malformed.";
    case "EMAIL_TAKEN":
      return "An account already exists with this email address. Try signing in instead.";
    case "INVALID_CREDENTIALS":
      return "Email or password is incorrect. Please check your credentials and try again.";
    case "UNAUTHORIZED":
      return "Your secure session has ended. Sign in again to continue.";

    // --- Upload (PRD section 17: File Too Large / Invalid File) ------------
    case "FILE_TOO_LARGE":
      // Server message carries the concrete sizes, e.g. "File size: 13.4 KB,
      // maximum allowed: 10 KB" — keep it, then add the PRD's next step.
      return fallback
        ? `${fallback} Please select a smaller file.`
        : "This file exceeds the maximum allowed size. Please select a smaller file.";
    case "INVALID_FILE_TYPE":
      return "Only human-readable .txt files are supported by this prototype.";
    case "EMPTY_FILE":
      return "This file contains no readable content. Select a document with text in it.";

    // --- Lookup ------------------------------------------------------------
    case "DOCUMENT_NOT_FOUND":
      return "This document no longer exists, or it does not belong to your vault.";
    case "TRANSFER_NOT_FOUND":
      return "This transfer record could not be located. It may have been removed.";

    // --- Cryptography ------------------------------------------------------
    case "UNSUPPORTED_ALGORITHM":
      return "That algorithm is not available. Choose Caesar, Playfair, SDES, or AES.";
    case "INVALID_KEY":
      return "This key is not valid for the selected algorithm. Check the required key format.";
    case "ENCRYPTION_FAILED":
      return "The document could not be encrypted. Verify the key and algorithm, then try again.";
    // PRD section 17 — Wrong Key.
    case "DECRYPTION_FAILED":
      return "The supplied key could not successfully decrypt this document.";

    // --- Transfer ----------------------------------------------------------
    case "TRANSFER_FAILED":
      return "The secure transfer was interrupted before it completed. Nothing was delivered.";
    case "INVALID_STATE":
      return "This action is not available for the current state of the transfer.";

    // --- Connectivity (PRD section 17 — Server Unavailable) ----------------
    case "SERVER_UNAVAILABLE":
    case "NETWORK_ERROR":
      return "Unable to establish connection.";

    // --- Catch-all ---------------------------------------------------------
    case "INTERNAL_ERROR":
      return "The server encountered an unexpected problem. Please try again in a moment.";

    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/**
 * True when the error means "we could not reach the server at all", which is
 * what OfflineBanner and any retry affordance keys off. Both the synthetic
 * client-side NETWORK_ERROR and the backend's 503 count.
 */
export function isOfflineCode(code: ApiErrorCode): boolean {
  return code === "NETWORK_ERROR" || code === "SERVER_UNAVAILABLE";
}

/**
 * True when the failure is worth offering a RETRY button for — transient
 * infrastructure problems, not user mistakes.
 */
export function isRetryableCode(code: ApiErrorCode): boolean {
  return (
    isOfflineCode(code) ||
    code === "INTERNAL_ERROR" ||
    code === "TRANSFER_FAILED" ||
    code === "ENCRYPTION_FAILED"
  );
}

/**
 * Convenience wrapper for `catch (err: unknown)` blocks. Turns anything
 * thrown into displayable copy without the caller narrowing types by hand.
 */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return getErrorMessage(error.code, error.message);
  if (error instanceof Error && error.message) return error.message;
  return "An unexpected error occurred.";
}

/** Same as describeError, but returns the ALL-CAPS heading. */
export function describeErrorTitle(error: unknown): string | undefined {
  return error instanceof ApiError ? getErrorTitle(error.code) : undefined;
}
