import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

type Variant = "accent" | "warning" | "danger";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  variant?: Variant;
}

const VARIANT_CLASS: Record<Variant, string | undefined> = {
  accent: undefined,
  warning: styles.iconWarning,
  danger: styles.iconDanger,
};

/** Shown instead of a bare table when a list has no rows, or a fetch failed. */
export function EmptyState({ icon, title, description, action, variant = "accent" }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <div className={[styles.icon, VARIANT_CLASS[variant]].filter(Boolean).join(" ")}>{icon}</div>}
      <p className={styles.title}>{title}</p>
      <p className={styles.description}>{description}</p>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}

/** Document/vault outline — used for empty document + transfer lists. */
export function VaultIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 5.5v3M12 15.5v3M5.5 12h3M15.5 12h3" strokeLinecap="round" />
    </svg>
  );
}

/** Offline/plug icon for network failure states. */
export function OfflineIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M3 3l18 18" strokeLinecap="round" />
      <path d="M5 12.5a10 10 0 0 1 4.2-2.3M19 12.5a10 10 0 0 0-6.6-2.4" strokeLinecap="round" />
      <path d="M8.5 16a5.5 5.5 0 0 1 7 0" strokeLinecap="round" />
      <circle cx="12" cy="19.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}
