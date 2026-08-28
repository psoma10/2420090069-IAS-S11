import { forwardRef, type ButtonHTMLAttributes } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
}

/**
 * Base button primitive. All variants/sizes/states (hover, focus, active,
 * disabled, loading) live here so every screen shares one implementation —
 * see UI Agent 4 (forms & controls) for state-specific extensions.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, fullWidth = false, disabled, className, children, ...rest }, ref) => {
    return (
      <button
        ref={ref}
        className={[styles.button, styles[variant], styles[size], fullWidth ? styles.fullWidth : "", className]
          .filter(Boolean)
          .join(" ")}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...rest}
      >
        {loading && <span className={styles.spinner} aria-hidden="true" />}
        <span className={loading ? styles.hiddenLabel : undefined}>{children}</span>
      </button>
    );
  },
);
Button.displayName = "Button";
