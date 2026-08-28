import type { ReactNode } from "react";
import { Button } from "../ui/Button";
import { AlertCircleIcon, AlertTriangleIcon, CheckCircleIcon, CloseIcon, InfoIcon, RetryIcon } from "./icons";
import styles from "./ErrorBanner.module.css";

export type BannerTone = "danger" | "warning" | "info" | "success";

interface ErrorBannerProps {
  /** Body copy. Prefer getErrorMessage(code, serverMessage) from lib/errorMessages. */
  message: ReactNode;
  /** ALL-CAPS heading, e.g. "DECRYPTION FAILED". Use getErrorTitle(code). */
  title?: string;
  /** Visual + icon treatment. Defaults to danger. */
  tone?: BannerTone;
  /** Renders a RETRY button when supplied. */
  onRetry?: () => void;
  /** Label for the retry button; PRD section 17 uses "RETRY". */
  retryLabel?: string;
  /** Disables the retry button and shows its spinner. */
  retrying?: boolean;
  /** Renders a dismiss (X) button when supplied. */
  onDismiss?: () => void;
  /** Extra actions (e.g. "Choose another file") rendered beside Retry. */
  actions?: ReactNode;
  /** Collapsible technical detail — error code, raw server message. */
  details?: string;
  /** Tighter padding for inline form errors. */
  compact?: boolean;
  className?: string;
}

const ICONS = {
  danger: AlertTriangleIcon,
  warning: AlertCircleIcon,
  info: InfoIcon,
  success: CheckCircleIcon,
} as const;

/**
 * Inline, in-flow message block for a failed operation.
 *
 * Announced to screen readers via role="alert" (assertive) for danger/warning
 * and role="status" (polite) for info/success, so a failure interrupts but a
 * confirmation does not. Tone is always reinforced by an icon and, when a
 * title is given, by text — colour is never the sole carrier of meaning.
 *
 * Usage:
 *   import { ErrorBanner } from "../components/feedback/ErrorBanner";
 *   import { getErrorMessage, getErrorTitle, isRetryableCode } from "../lib/errorMessages";
 *
 *   {error && (
 *     <ErrorBanner
 *       title={getErrorTitle(error.code)}
 *       message={getErrorMessage(error.code, error.message)}
 *       onRetry={isRetryableCode(error.code) ? reload : undefined}
 *       onDismiss={() => setError(null)}
 *     />
 *   )}
 */
export function ErrorBanner({
  message,
  title,
  tone = "danger",
  onRetry,
  retryLabel = "RETRY",
  retrying = false,
  onDismiss,
  actions,
  details,
  compact = false,
  className,
}: ErrorBannerProps) {
  const Icon = ICONS[tone];
  const assertive = tone === "danger" || tone === "warning";

  return (
    <div
      className={[styles.banner, styles[tone], compact ? styles.compact : "", className].filter(Boolean).join(" ")}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <Icon className={styles.icon} size={compact ? 16 : 18} />

      <div className={styles.body}>
        {/* Redundant text label so the tone is readable without colour. */}
        {title && <span className={styles.title}>{title}</span>}
        <span className={styles.message}>{message}</span>

        {details && (
          <details className={styles.details}>
            <summary className={styles.detailsSummary}>Technical details</summary>
            <pre className={styles.detailsBody}>{details}</pre>
          </details>
        )}

        {(onRetry || actions) && (
          <div className={styles.actions}>
            {onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry} loading={retrying}>
                <span className={styles.buttonInner}>
                  <RetryIcon size={14} />
                  {retryLabel}
                </span>
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>

      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss message">
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}
