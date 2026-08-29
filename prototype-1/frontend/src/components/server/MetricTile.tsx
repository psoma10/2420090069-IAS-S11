import type { ReactNode } from "react";
import { Skeleton } from "./PageState";
import styles from "./MetricTile.module.css";

interface MetricTileProps {
  label: string;
  value: ReactNode;
  /** Short qualifier under the number, e.g. "client → server". */
  caption?: string;
  /** Tabular figures. Off for values that are words rather than counts. */
  numeric?: boolean;
  loading?: boolean;
  accent?: "default" | "success" | "danger";
}

/**
 * Single labelled metric in the server statistics grid.
 *
 * Label sits above the value in small caps — an ops-console convention that
 * keeps a dense grid scannable by label without the numbers competing.
 */
export function MetricTile({
  label,
  value,
  caption,
  numeric = true,
  loading = false,
  accent = "default",
}: MetricTileProps) {
  return (
    <div className={styles.tile}>
      <p className={styles.label}>{label}</p>
      {loading ? (
        <Skeleton width="4ch" height={30} />
      ) : (
        <p className={[styles.value, numeric ? styles.numeric : "", styles[accent]].filter(Boolean).join(" ")}>
          {value}
        </p>
      )}
      {caption && !loading && <p className={styles.caption}>{caption}</p>}
    </div>
  );
}
