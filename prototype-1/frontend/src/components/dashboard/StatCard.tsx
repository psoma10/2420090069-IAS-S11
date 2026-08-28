import type { ReactNode } from "react";
import styles from "./StatCard.module.css";

type Accent = "accent" | "success" | "info" | "warning";

interface StatCardProps {
  label: string;
  value: ReactNode;
  /** Short qualifier under the number, e.g. "18 of 18 succeeded". */
  hint?: string;
  icon: ReactNode;
  accent?: Accent;
}

/**
 * Scannable KPI tile for the dashboard stat row (PRD FR-02).
 * Local to src/components/dashboard because src/components/ui exposes no
 * StatTile primitive; promote it there if another screen needs the same shape.
 */
export function StatCard({ label, value, hint, icon, accent = "accent" }: StatCardProps) {
  return (
    <div className={[styles.card, styles[accent]].join(" ")}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{value}</dd>
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
