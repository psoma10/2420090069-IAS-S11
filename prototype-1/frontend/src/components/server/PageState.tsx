import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { ApiError } from "../../lib/api";
import styles from "./PageState.module.css";

/**
 * Shimmering placeholder block. Sized by the caller so skeletons match the
 * real content box and the layout does not jump when data lands.
 */
export function Skeleton({ width, height = 16 }: { width?: string; height?: number }) {
  return (
    <span
      className={styles.skeleton}
      style={{ width: width ?? "100%", height }}
      aria-hidden="true"
    />
  );
}

/** Empty state: neutral icon, one-line explanation, optional next action. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 7.5h16M4 12h16M4 16.5h10" />
        </svg>
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyDescription}>{description}</p>
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}

/**
 * Error state. Maps the contract's error codes to plain remediation copy —
 * never dumps a raw code or stack at the user.
 */
export function ErrorState({ error, onRetry }: { error: ApiError | null; onRetry: () => void }) {
  const { title, description } = describeError(error);

  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorIcon} aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v5" />
          <path d="M12 16.5h.01" />
          <path d="M10.3 3.9 2.4 17.4A2 2 0 0 0 4.1 20.4h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </span>
      <div className={styles.errorBody}>
        <p className={styles.errorTitle}>{title}</p>
        <p className={styles.errorDescription}>{description}</p>
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function describeError(error: ApiError | null): { title: string; description: string } {
  switch (error?.code) {
    case "NETWORK_ERROR":
    case "SERVER_UNAVAILABLE":
      return {
        title: "Cannot reach the CyberVault server",
        description: "The monitoring endpoint did not respond. Confirm the backend is running, then retry.",
      };
    case "UNAUTHORIZED":
      return {
        title: "Session expired",
        description: "Your session is no longer valid. Log in again to continue monitoring.",
      };
    default:
      return {
        title: "Could not load this view",
        description: error?.message ?? "An unexpected error occurred while loading data.",
      };
  }
}

/**
 * Inline notice shown when sample data stands in for an unreachable backend.
 * Explicit about it — silently showing fake numbers on a monitoring screen
 * would be worse than showing nothing.
 */
export function FallbackNotice() {
  return (
    <p className={styles.fallback} role="status">
      <span className={styles.fallbackDot} aria-hidden="true" />
      Server unreachable — showing sample data.
    </p>
  );
}
