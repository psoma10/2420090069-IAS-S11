import type { ComponentType, ReactNode, SVGProps } from "react";
import { VaultIcon } from "./icons";
import styles from "./EmptyState.module.css";

interface EmptyStateProps {
  /** Short, specific headline — "No documents yet", not "Empty". */
  title: string;
  /** One or two sentences explaining what will appear here and how. */
  description?: ReactNode;
  /**
   * Line-art icon component from ./icons (DocumentIcon, TransferIcon,
   * ActivityIcon, SearchIcon, VaultIcon). Never an emoji — the PRD calls for a
   * professional security product, and emoji render inconsistently.
   */
  icon?: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
  /** Primary call to action, usually a <Button>. */
  action?: ReactNode;
  /** Secondary action rendered beside the primary one. */
  secondaryAction?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Drops the dashed card chrome — use when already inside a <Card>. */
  bare?: boolean;
  className?: string;
}

/**
 * "Nothing here yet" state for empty lists, tables, and panels.
 *
 * Deliberately designed rather than blank: a framed icon, a headline, guidance
 * copy, and a next action. An empty screen with no explanation reads as a bug.
 *
 * Usage:
 *   import { EmptyState } from "../components/feedback/EmptyState";
 *   import { DocumentIcon } from "../components/feedback/icons";
 *
 *   {documents.length === 0 && (
 *     <EmptyState
 *       icon={DocumentIcon}
 *       title="No documents in your vault"
 *       description="Upload a .txt file up to 10 KB to encrypt it and send it to the server."
 *       action={<Button onClick={() => navigate("/upload")}>SECURE DOCUMENT</Button>}
 *     />
 *   )}
 */
export function EmptyState({
  title,
  description,
  icon: Icon = VaultIcon,
  action,
  secondaryAction,
  size = "md",
  bare = false,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={[styles.empty, styles[size], bare ? styles.bare : "", className].filter(Boolean).join(" ")}
      // Not a live region: empty states render with the page, they don't
      // interrupt. Screen readers reach the heading in normal reading order.
    >
      <span className={styles.iconWrap}>
        <Icon size={size === "sm" ? 20 : 24} />
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {(action || secondaryAction) && (
        <div className={styles.actions}>
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
