import { forwardRef, useId, type SelectHTMLAttributes, type ReactNode } from "react";
import styles from "./Select.module.css";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: string;
  options?: SelectOption[];
  error?: string;
  hint?: string;
  placeholder?: string;
  children?: ReactNode;
}

/**
 * Labeled dropdown built on a native <select>.
 *
 * Deliberately NOT a custom listbox: the native control gives us free
 * keyboard support, type-ahead, and the platform picker on mobile — all of
 * which a hand-rolled div-based dropdown would have to reimplement (badly).
 * Only the chevron and the field chrome are styled.
 *
 * Pass either `options` or `children` (raw <option>/<optgroup>).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, hint, placeholder, id, className, children, ...rest }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    const hintId = hint ? `${selectId}-hint` : undefined;
    const errorId = error ? `${selectId}-error` : undefined;

    return (
      <div className={styles.field}>
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>

        <div className={styles.wrapper}>
          <select
            ref={ref}
            id={selectId}
            className={[styles.select, error ? styles.invalid : "", className].filter(Boolean).join(" ")}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options?.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
            {children}
          </select>

          {/* Chevron is decorative — the native select already announces itself. */}
          <svg className={styles.chevron} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="M4 6l4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {hint && !error && (
          <p id={hintId} className={styles.hint}>
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);
Select.displayName = "Select";
