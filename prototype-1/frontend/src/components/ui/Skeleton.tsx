import styles from "./Skeleton.module.css";

interface SkeletonProps {
  /** Any valid CSS width, e.g. "100%", "12rem", 240. */
  width?: string | number;
  height?: string | number;
  variant?: "text" | "block" | "circle";
  /** Number of stacked lines; only meaningful for variant="text". */
  lines?: number;
  className?: string;
}

/**
 * Loading placeholder. Prefer this over a spinner for content that has a
 * known shape (tables, cards, detail panes) — it preserves layout and
 * avoids the reflow jump when real data lands.
 *
 * Renders aria-hidden: announce loading state once on the containing
 * region instead of letting every bar shout at a screen reader.
 */
export function Skeleton({ width, height, variant = "text", lines = 1, className }: SkeletonProps) {
  const style = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  if (variant === "text" && lines > 1) {
    return (
      <div className={styles.stack} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            className={[styles.skeleton, styles.text, className].filter(Boolean).join(" ")}
            /* Last line runs short so the block reads as prose, not a slab. */
            style={{ ...style, width: i === lines - 1 ? "70%" : style.width }}
          />
        ))}
      </div>
    );
  }

  return (
    <span
      className={[styles.skeleton, styles[variant], className].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    />
  );
}
