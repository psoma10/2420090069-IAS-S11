import styles from "./DashboardSkeleton.module.css";

const STAT_KEYS = ["documents", "transfers", "algorithms", "success"];
const ROW_KEYS = ["a", "b", "c", "d", "e"];

/**
 * Structural placeholder that mirrors the real dashboard grid, so the
 * transition to loaded content is a fill-in rather than a layout jump.
 * The whole region is aria-busy and the status is announced politely.
 */
export function DashboardSkeleton() {
  return (
    <div className={styles.wrapper} aria-hidden="true">
      <div className={styles.headerRow}>
        <div className={[styles.shimmer, styles.title].join(" ")} />
        <div className={[styles.shimmer, styles.cta].join(" ")} />
      </div>

      <div className={styles.statGrid}>
        {STAT_KEYS.map((key) => (
          <div key={key} className={styles.statCard}>
            <div className={[styles.shimmer, styles.statIcon].join(" ")} />
            <div className={styles.statText}>
              <div className={[styles.shimmer, styles.statLabel].join(" ")} />
              <div className={[styles.shimmer, styles.statValue].join(" ")} />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.panels}>
        {["transfers", "activity"].map((panel) => (
          <div key={panel} className={styles.panel}>
            <div className={[styles.shimmer, styles.panelTitle].join(" ")} />
            {ROW_KEYS.map((row) => (
              <div key={row} className={styles.row}>
                <div className={[styles.shimmer, styles.rowMain].join(" ")} />
                <div className={[styles.shimmer, styles.rowMeta].join(" ")} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
