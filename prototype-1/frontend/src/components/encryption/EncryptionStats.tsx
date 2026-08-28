import styles from "./EncryptionStats.module.css";

function CheckIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={styles.statusIcon}
      aria-hidden="true"
    >
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** Bytes -> "8.7 KB". Formatting is the frontend's job per API contract section 6. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export interface EncryptionStatsProps {
  algorithmLabel: string;
  plaintextSize: number;
  ciphertextSize: number;
  /** Encryption or decryption duration in ms, per API contract section 6. */
  timeMs: number;
  timeLabel?: string;
  statusLabel?: string;
}

/**
 * PRD FR-12 encryption details: algorithm, sizes, timing and a success marker.
 * Purely presentational — the page owns data fetching and fallback.
 */
export function EncryptionStats({
  algorithmLabel,
  plaintextSize,
  ciphertextSize,
  timeMs,
  timeLabel = "Encryption Time",
  statusLabel = "Successfully encrypted",
}: EncryptionStatsProps) {
  return (
    <dl className={styles.grid}>
      <div className={styles.item}>
        <dt className={styles.label}>Algorithm</dt>
        <dd className={styles.value}>{algorithmLabel}</dd>
      </div>
      <div className={styles.item}>
        <dt className={styles.label}>Plaintext Size</dt>
        <dd className={[styles.value, styles.valueMono].join(" ")}>
          {plaintextSize.toLocaleString()} B
        </dd>
      </div>
      <div className={styles.item}>
        <dt className={styles.label}>Ciphertext Size</dt>
        <dd className={[styles.value, styles.valueMono].join(" ")}>
          {ciphertextSize.toLocaleString()} B
        </dd>
      </div>
      <div className={styles.item}>
        <dt className={styles.label}>{timeLabel}</dt>
        <dd className={[styles.value, styles.valueMono].join(" ")}>{timeMs.toFixed(2)} ms</dd>
      </div>
      <div className={styles.item}>
        <dt className={styles.label}>Status</dt>
        <dd className={styles.status}>
          <CheckIcon />
          {statusLabel}
        </dd>
      </div>
    </dl>
  );
}
