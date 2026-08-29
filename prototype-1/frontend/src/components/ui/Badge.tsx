import type { ReactNode } from "react";
import styles from "./Badge.module.css";

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
}

/** Status/algorithm-type pill. Used for transfer status, algorithm badges, server status. */
export function Badge({ children, tone = "neutral", dot = false }: BadgeProps) {
  return (
    <span className={[styles.badge, styles[tone]].join(" ")}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
