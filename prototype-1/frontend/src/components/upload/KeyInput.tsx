import { useId, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import type { Algorithm } from "../../types/api";
import styles from "./KeyInput.module.css";

interface KeyInputProps {
  algorithm: Algorithm | null;
  value: string;
  keySize: number;
  error?: string;
  generating?: boolean;
  disabled?: boolean;
  /** Set once a key has been produced by the server, cleared on manual edit. */
  wasGenerated?: boolean;
  onChange: (key: string) => void;
  onKeySizeChange: (size: number) => void;
  onGenerate: () => void;
}

/**
 * FR-05. Key entry with server-side generation, plus the AES-128/192/256
 * size selector the PRD calls for. The field is monospace and rendered as a
 * password by default so a key is not casually shoulder-surfed, with an
 * explicit reveal for when the user needs to copy or verify it.
 */
export function KeyInput({
  algorithm,
  value,
  keySize,
  error,
  generating = false,
  disabled = false,
  wasGenerated = false,
  onChange,
  onKeySizeChange,
  onGenerate,
}: KeyInputProps) {
  const [revealed, setRevealed] = useState(false);
  const sizeGroupName = useId();
  const sizeLabelId = useId();

  const supportsSizes = Boolean(algorithm?.key_sizes.length);
  const canGenerate = Boolean(algorithm?.supports_generate) && !disabled;

  return (
    <div className={styles.wrapper}>
      {supportsSizes && algorithm && (
        <div className={styles.sizeRow}>
          <span className={styles.sizeLabel} id={sizeLabelId}>
            Key size
          </span>
          <div className={styles.segmented} role="group" aria-labelledby={sizeLabelId}>
            {algorithm.key_sizes.map((size) => (
              <label key={size} className={styles.segment}>
                <input
                  type="radio"
                  className={styles.segmentInput}
                  name={sizeGroupName}
                  value={size}
                  checked={keySize === size}
                  disabled={disabled || generating}
                  onChange={() => onKeySizeChange(size)}
                />
                AES-{size}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={styles.keyRow}>
        <div className={styles.keyField}>
          <Input
            label="Encryption key"
            type={revealed ? "text" : "password"}
            value={value}
            monospace
            autoComplete="off"
            spellCheck={false}
            disabled={disabled || generating}
            error={error}
            hint={error ? undefined : algorithm ? algorithm.key_format : "Select an algorithm first."}
            placeholder={generating ? "Generating…" : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>

        <div className={styles.keyActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRevealed((v) => !v)}
            disabled={disabled || generating || !value}
            aria-pressed={revealed}
          >
            {revealed ? "Hide" : "Show"}
          </Button>
          <Button type="button" variant="secondary" onClick={onGenerate} loading={generating} disabled={!canGenerate}>
            Generate Key
          </Button>
        </div>
      </div>

      {wasGenerated && !error && (
        <p className={styles.generated} role="status">
          <span aria-hidden="true">✓</span>
          Key generated. Copy it somewhere safe — you need the same key to decrypt.
        </p>
      )}

      <p className={styles.warning}>
        <span className={styles.warningIcon} aria-hidden="true">
          !
        </span>
        <span>
          Keep this key private. CyberVault never writes encryption keys to its application logs, and a document cannot
          be recovered without its key.
        </span>
      </p>
    </div>
  );
}
