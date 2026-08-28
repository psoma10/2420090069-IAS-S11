import { useId, type ReactElement } from "react";
import styles from "./Tooltip.module.css";

interface TooltipProps {
  /** Tooltip text. Keep it short — this is a hint, not documentation. */
  label: string;
  children: ReactElement;
  placement?: "top" | "bottom";
}

/**
 * Lightweight hint shown on hover AND keyboard focus (focus-within), so
 * it isn't mouse-only. CSS-driven — no positioning library, no state.
 *
 * The tooltip is the accessible description of its trigger via
 * aria-describedby, so the trigger still needs its own accessible name.
 * Do not use this to label an icon-only button — give that button an
 * aria-label as well.
 */
export function Tooltip({ label, children, placement = "top" }: TooltipProps) {
  const id = useId();

  return (
    <span className={styles.wrapper}>
      <span className={styles.trigger} aria-describedby={id}>
        {children}
      </span>
      <span role="tooltip" id={id} className={[styles.tip, styles[placement]].join(" ")}>
        {label}
      </span>
    </span>
  );
}
