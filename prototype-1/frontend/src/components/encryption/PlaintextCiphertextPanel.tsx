import type { ReactNode } from "react";
import styles from "./PlaintextCiphertextPanel.module.css";

/** Shared icon geometry — 16px box, 1.5 stroke, matches stage pipeline icons. */
const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function DocumentIcon() {
  return (
    <svg {...ICON_PROPS} className={styles.panelTitleIcon}>
      <path d="M9 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5.5L9 1.5Z" />
      <path d="M9 1.5v4h4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg {...ICON_PROPS} className={styles.panelTitleIcon}>
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5.5 7V4.75a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 9h11" />
      <path d="M10 5l4 4-4 4" />
    </svg>
  );
}

interface PanelProps {
  title: string;
  icon: ReactNode;
  meta?: string;
  children: ReactNode;
  variant: "plain" | "cipher";
  /** Applies the one-time reveal animation. Only ever set on the cipher side. */
  revealKey?: string | number;
  bodyClassName?: string;
}

function Panel({ title, icon, meta, children, variant, revealKey, bodyClassName }: PanelProps) {
  const isCipher = variant === "cipher";
  return (
    <section className={[styles.panel, isCipher ? styles.panelCipher : ""].filter(Boolean).join(" ")}>
      <header className={styles.panelHeader}>
        <h3 className={styles.panelTitle}>
          {icon}
          {title}
        </h3>
        {meta && <span className={styles.panelMeta}>{meta}</span>}
      </header>
      {/*
        `key` on the reveal wrapper restarts the CSS animation whenever a new
        result arrives — no JS timers involved, so prefers-reduced-motion
        (which zeroes the duration) is honoured automatically.
      */}
      <pre
        key={revealKey}
        className={[
          styles.body,
          isCipher ? styles.bodyCipher : styles.bodyPlain,
          revealKey !== undefined ? styles.reveal : "",
          bodyClassName,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {children}
      </pre>
    </section>
  );
}

export interface PlaintextCiphertextPanelProps {
  plaintext: string;
  ciphertext: string;
  plaintextMeta?: string;
  ciphertextMeta?: string;
  /** Label shown on the transform marker between panels, e.g. "AES-256". */
  transformLabel?: string;
  /** Changing this value replays the ciphertext reveal (one result = one reveal). */
  revealKey?: string | number;
  /** Reverses direction: ciphertext on the left, recovered plaintext on the right. */
  reversed?: boolean;
  emptyCiphertextLabel?: string;
}

/**
 * PRD Screen 4 core: the plaintext -> encryption -> ciphertext transformation
 * rendered as two panels with a directional marker between them. Ciphertext is
 * always monospace (PRD section 8). Stacks vertically below 768px.
 */
export function PlaintextCiphertextPanel({
  plaintext,
  ciphertext,
  plaintextMeta,
  ciphertextMeta,
  transformLabel = "Encrypt",
  revealKey,
  reversed = false,
  emptyCiphertextLabel = "Ciphertext appears here after encryption.",
}: PlaintextCiphertextPanelProps) {
  const plainPanel = (
    <Panel
      key="plain"
      title={reversed ? "Recovered Plaintext" : "Plaintext"}
      icon={<DocumentIcon />}
      meta={plaintextMeta}
      variant="plain"
      revealKey={reversed ? revealKey : undefined}
    >
      {plaintext || <span className={styles.empty}>No plaintext loaded.</span>}
    </Panel>
  );

  const cipherPanel = (
    <Panel
      key="cipher"
      title="Ciphertext"
      icon={<LockIcon />}
      meta={ciphertextMeta}
      variant="cipher"
      revealKey={reversed ? undefined : revealKey}
    >
      {ciphertext || <span className={styles.empty}>{emptyCiphertextLabel}</span>}
    </Panel>
  );

  return (
    <div className={styles.grid}>
      {reversed ? cipherPanel : plainPanel}
      <div className={styles.transform}>
        <span className={styles.transformIcon}>
          <ArrowIcon />
        </span>
        <span className={styles.transformLabel}>{transformLabel}</span>
      </div>
      {reversed ? plainPanel : cipherPanel}
    </div>
  );
}
