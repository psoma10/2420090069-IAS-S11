import styles from "./Divider.module.css";

interface DividerProps {
  orientation?: "horizontal" | "vertical";
  /** Optional inline label, e.g. "OR" on the login screen. Horizontal only. */
  label?: string;
  spacing?: "none" | "sm" | "md" | "lg";
  className?: string;
}

/**
 * Rule for separating content groups.
 *
 * Semantics: a labelled divider is a real <div role="separator"> with the
 * text inside; an unlabelled one is a plain <hr>. Vertical dividers are
 * decorative and hidden from assistive tech.
 */
export function Divider({ orientation = "horizontal", label, spacing = "md", className }: DividerProps) {
  if (label && orientation === "horizontal") {
    return (
      <div className={[styles.labelled, styles[`space-${spacing}`], className].filter(Boolean).join(" ")}>
        <span className={styles.rule} aria-hidden="true" />
        <span className={styles.label}>{label}</span>
        <span className={styles.rule} aria-hidden="true" />
      </div>
    );
  }

  if (orientation === "vertical") {
    return <span className={[styles.vertical, className].filter(Boolean).join(" ")} aria-hidden="true" />;
  }

  return <hr className={[styles.horizontal, styles[`space-${spacing}`], className].filter(Boolean).join(" ")} />;
}
