import type { ReactNode } from "react";
import styles from "./Alert.module.css";

type Tone = "info" | "success" | "warning" | "danger";

interface AlertProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  /** Renders a dismiss button. Omit for messages the user must act on. */
  onDismiss?: () => void;
  /** Trailing action, e.g. a Retry button. */
  action?: ReactNode;
  className?: string;
}

const ICONS: Record<Tone, string> = {
  // Simple geometric glyphs — no icon dependency, no decorative flourish.
  info: "M8 7.5v4m0-6.5h.01",
  success: "M4.5 8.5l2.5 2.5 4.5-5",
  warning: "M8 5.5v3.5m0 2.5h.01",
  danger: "M5.5 5.5l5 5m0-5l-5 5",
};

/**
 * Inline status banner for form results, transfer outcomes, and errors.
 *
 * Live-region semantics are tone-driven: danger/warning use role="alert"
 * (assertive, interrupts) while info/success use role="status" (polite).
 * That way a failed decryption is announced immediately but a routine
 * success doesn't cut off whatever the user is reading.
 */
export function Alert({ tone = "info", title, children, onDismiss, action, className }: AlertProps) {
  const assertive = tone === "danger" || tone === "warning";

  return (
    <div
      className={[styles.alert, styles[tone], className].filter(Boolean).join(" ")}
      role={assertive ? "alert" : "status"}
      aria-live={assertive ? "assertive" : "polite"}
    >
      <svg className={styles.icon} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="6.75" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.5" />
        <path
          d={ICONS[tone]}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div className={styles.message}>{children}</div>}
      </div>

      {action && <div className={styles.action}>{action}</div>}

      {onDismiss && (
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss message">
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M4.5 4.5l7 7m0-7l-7 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
