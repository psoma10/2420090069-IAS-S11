import { useId } from "react";
import type { Algorithm, AlgorithmId, AlgorithmType } from "../../types/api";
import styles from "./AlgorithmSelector.module.css";

interface AlgorithmSelectorProps {
  algorithms: Algorithm[];
  value: AlgorithmId | null;
  loading?: boolean;
  disabled?: boolean;
  /** True when `algorithms` came from the local fallback, not the API. */
  usingFallback?: boolean;
  onChange: (id: AlgorithmId) => void;
}

const TYPE_CLASS: Record<AlgorithmType, string> = {
  classical: styles.tagClassical,
  educational: styles.tagEducational,
  modern: styles.tagModern,
};

/**
 * FR-04. Native radios in a fieldset, so arrow-key navigation, the roving
 * tab stop, and group labelling all come from the platform. The visual card
 * is styled from the radio's :checked / :focus-visible state via :has(),
 * which keeps behaviour and appearance in sync without JS key handling.
 */
export function AlgorithmSelector({
  algorithms,
  value,
  loading = false,
  disabled = false,
  usingFallback = false,
  onChange,
}: AlgorithmSelectorProps) {
  const groupName = useId();

  if (loading) {
    return (
      <fieldset className={styles.group} aria-busy="true">
        <legend className={styles.legend}>Encryption algorithm</legend>
        <p className={styles.hint}>Loading available algorithms…</p>
        <div className={styles.grid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={styles.skeleton} />
          ))}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.legend}>Encryption algorithm</legend>
      <p className={styles.hint}>
        Caesar, Playfair and SDES are included for the academic demonstration. AES is the recommended choice for a
        genuine secure transfer.
      </p>

      <div className={styles.grid}>
        {algorithms.map((algorithm) => (
          <label key={algorithm.id} className={styles.option}>
            <input
              type="radio"
              className={styles.radio}
              name={groupName}
              value={algorithm.id}
              checked={value === algorithm.id}
              disabled={disabled}
              onChange={() => onChange(algorithm.id)}
            />
            <span className={styles.marker} aria-hidden="true" />
            <span className={styles.body}>
              <span className={styles.head}>
                <span className={styles.name}>{algorithm.name}</span>
                <span className={[styles.tag, TYPE_CLASS[algorithm.type]].filter(Boolean).join(" ")}>
                  {algorithm.type}
                </span>
                {algorithm.id === "aes" && <span className={styles.recommended}>Recommended</span>}
              </span>
              <span className={styles.description}>{algorithm.description}</span>
              <span className={styles.keyFormat}>Key: {algorithm.key_format}</span>
            </span>
          </label>
        ))}
      </div>

      {usingFallback && (
        <p className={styles.fallbackNote} role="status">
          <span aria-hidden="true">▲</span>
          Showing the built-in algorithm list — the server could not be reached.
        </p>
      )}
    </fieldset>
  );
}
