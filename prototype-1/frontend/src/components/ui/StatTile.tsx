import type { ReactNode } from "react";
import styles from "./StatTile.module.css";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

interface StatTileProps {
  label: string;
  value: ReactNode;
  /** Short qualifier under the number, e.g. "across 4 algorithms". */
  caption?: string;
  icon?: ReactNode;
  tone?: Tone;
  /** Renders a shimmer placeholder instead of the value. */
  loading?: boolean;
}

/**
 * Dashboard metric tile (FR-02): one big number plus context.
 *
 * The number uses tabular figures so a column of tiles stays optically
 * aligned and doesn't jitter when values update during a live transfer.
 */
export function StatTile({ label, value, caption, icon, tone = "neutral", loading = false }: StatTileProps) {
  return (
    <div className={[styles.tile, styles[tone]].join(" ")}>
      <div className={styles.head}>
        <span className={styles.label}>{label}</span>
        {icon && (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <div className={styles.valueSkeleton} role="status" aria-label={`Loading ${label}`} />
      ) : (
        <p className={styles.value}>{value}</p>
      )}

      {caption && !loading && <p className={styles.caption}>{caption}</p>}
    </div>
  );
}
