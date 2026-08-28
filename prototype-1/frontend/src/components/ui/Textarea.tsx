import { forwardRef, useId, type TextareaHTMLAttributes } from "react";
import styles from "./Textarea.module.css";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
  hint?: string;
  /** Use for ciphertext, keys, hashes — anything where character alignment matters. */
  monospace?: boolean;
  /** Shows a live "n / max" counter. Requires maxLength to render the limit. */
  showCount?: boolean;
  resize?: "none" | "vertical";
}

/**
 * Labeled multi-line field. The primary surface for pasted ciphertext and
 * plaintext payloads, so `monospace` is a first-class prop rather than a
 * one-off className.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { label, error, hint, monospace, showCount, resize = "vertical", rows = 6, id, className, value, maxLength, ...rest },
    ref,
  ) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const errorId = error ? `${fieldId}-error` : undefined;
    const countId = showCount ? `${fieldId}-count` : undefined;

    const length = typeof value === "string" ? value.length : 0;
    const overLimit = typeof maxLength === "number" && length > maxLength;

    return (
      <div className={styles.field}>
        <div className={styles.header}>
          <label htmlFor={fieldId} className={styles.label}>
            {label}
          </label>
          {showCount && (
            <span
              id={countId}
              className={[styles.count, overLimit ? styles.countOver : ""].filter(Boolean).join(" ")}
              /* Polite so screen readers aren't interrupted on every keystroke. */
              aria-live="polite"
            >
              {length}
              {typeof maxLength === "number" ? ` / ${maxLength}` : ""}
            </span>
          )}
        </div>

        <textarea
          ref={ref}
          id={fieldId}
          rows={rows}
          value={value}
          maxLength={maxLength}
          className={[
            styles.textarea,
            monospace ? styles.mono : "",
            resize === "none" ? styles.resizeNone : styles.resizeVertical,
            error ? styles.invalid : "",
            className,
          ]
            .filter(Boolean)
            .join(" ")}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={[hintId, errorId, countId].filter(Boolean).join(" ") || undefined}
          {...rest}
        />

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
Textarea.displayName = "Textarea";
