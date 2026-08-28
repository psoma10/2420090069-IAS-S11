import type { CSSProperties } from "react";
import styles from "./Skeleton.module.css";

type SkeletonVariant = "text" | "title" | "block" | "circle";

interface SkeletonProps {
  variant?: SkeletonVariant;
  /** CSS width, e.g. "60%" or 120. Defaults to full width. */
  width?: string | number;
  /** CSS height. Defaults come from the variant. */
  height?: string | number;
  /** Border radius override. */
  radius?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Loading placeholder block with a shimmer sweep.
 *
 * Always aria-hidden and wrapped by a container that carries the live status
 * message (see SkeletonList/SkeletonCard below), so assistive tech hears
 * "Loading…" once rather than reading a dozen empty boxes.
 *
 * Motion note: base.css globally clamps animation-duration under
 * prefers-reduced-motion, so the shimmer degrades to a static bar for free.
 *
 * Usage:
 *   import { Skeleton, SkeletonText, SkeletonCard, SkeletonTable } from "../components/feedback/Skeleton";
 *
 *   if (loading) return <SkeletonTable rows={5} label="Loading transfers" />;
 */
export function Skeleton({ variant = "text", width, height, radius, className, style }: SkeletonProps) {
  return (
    <span
      className={[styles.skeleton, styles[variant], className].filter(Boolean).join(" ")}
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

interface SkeletonTextProps {
  /** Number of placeholder lines. The last one is rendered short. */
  lines?: number;
  width?: string | number;
  className?: string;
}

/** Paragraph placeholder — n shimmer lines with a ragged last line. */
export function SkeletonText({ lines = 3, width, className }: SkeletonTextProps) {
  return (
    <span className={[styles.lines, className].filter(Boolean).join(" ")} aria-hidden="true" style={{ width }}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} variant="text" />
      ))}
    </span>
  );
}

interface SkeletonCardProps {
  lines?: number;
  /** Announced to screen readers while content loads. */
  label?: string;
  className?: string;
}

/** Dashboard/stat card placeholder, chrome included. */
export function SkeletonCard({ lines = 2, label = "Loading", className }: SkeletonCardProps) {
  return (
    <div className={[styles.card, className].filter(Boolean).join(" ")} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Skeleton variant="text" width="40%" />
      <Skeleton variant="title" width="55%" />
      {lines > 2 && <SkeletonText lines={lines - 2} />}
    </div>
  );
}

interface SkeletonTableProps {
  rows?: number;
  /** Show a leading circle (avatar/status dot) on each row. */
  withIcon?: boolean;
  label?: string;
  className?: string;
}

/** List/table placeholder for documents, transfers, and activity feeds. */
export function SkeletonTable({ rows = 4, withIcon = true, label = "Loading", className }: SkeletonTableProps) {
  return (
    <div className={className} role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.row}>
          {withIcon && <Skeleton variant="circle" width={32} height={32} />}
          <span className={styles.rowMain}>
            <SkeletonText lines={2} />
          </span>
          <Skeleton variant="text" width={72} />
        </div>
      ))}
    </div>
  );
}
