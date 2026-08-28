import type { TransferStage, TransferStageName } from "../../types/api";
import { StageStep } from "./StageStep";
import styles from "./StagePipeline.module.css";

/**
 * The five PRD Screen 5 stages in order. The API's `stages` array is a
 * subset — POST /api/transfers returns only the first three until the
 * receiver calls /decrypt — so we render this canonical list and merge in
 * whatever the server has reported so far.
 */
const STAGE_ORDER: TransferStageName[] = [
  "ENCRYPTING",
  "TRANSMITTING",
  "RECEIVED",
  "DECRYPTING",
  "COMPLETED",
];

const STAGE_LABEL: Record<TransferStageName, string> = {
  ENCRYPTING: "Encrypting",
  TRANSMITTING: "Transmitting",
  RECEIVED: "Receiving",
  DECRYPTING: "Decrypting",
  COMPLETED: "Completed",
};

const STAGE_DESCRIPTION: Record<TransferStageName, string> = {
  ENCRYPTING: "Cipher applied on the client. Plaintext never leaves this machine.",
  TRANSMITTING: "Ciphertext in flight across the network.",
  RECEIVED: "Server acknowledged the encrypted payload.",
  DECRYPTING: "Receiver reverses the cipher with the shared key.",
  COMPLETED: "Original document recovered and verified.",
};

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

function ClientIcon() {
  return (
    <svg {...ICON_PROPS} className={styles.endpointIcon}>
      <rect x="1.75" y="3" width="12.5" height="8.5" rx="1" />
      <path d="M5.5 14h5" />
    </svg>
  );
}

function ServerIcon() {
  return (
    <svg {...ICON_PROPS} className={styles.endpointIcon}>
      <rect x="2" y="2.5" width="12" height="4.5" rx="1" />
      <rect x="2" y="9" width="12" height="4.5" rx="1" />
      <path d="M4.75 4.75h.01M4.75 11.25h.01" />
    </svg>
  );
}

export interface StagePipelineProps {
  /** Raw `stages` from TransferDetail / DecryptResult. May be partial. */
  stages: TransferStage[];
  /** Marks the whole transfer failed so unreached stages don't imply progress. */
  failed?: boolean;
  senderLabel?: string;
  receiverLabel?: string;
  children?: React.ReactNode;
}

/**
 * Resolves the canonical five-stage list from a partial API `stages` array.
 *
 * A stage the API hasn't mentioned is `pending`, unless a later stage is
 * already done — in which case it must have completed too (the backend runs
 * the state machine synchronously and may skip intermediate reports).
 */
export function resolveStages(stages: TransferStage[], failed = false): TransferStage[] {
  const reported = new Map(stages.map((s) => [s.stage, s]));

  const lastDoneIndex = STAGE_ORDER.reduce((acc, name, index) => {
    const entry = reported.get(name);
    return entry && entry.status === "done" ? index : acc;
  }, -1);

  return STAGE_ORDER.map((name, index) => {
    const entry = reported.get(name);
    if (entry) {
      // Backfill: anything before a completed stage is itself complete.
      if (entry.status === "pending" && index < lastDoneIndex) {
        return { ...entry, status: "done" as const };
      }
      return entry;
    }

    if (index < lastDoneIndex) {
      return { stage: name, status: "done" as const, at: null };
    }

    // The step immediately after the last completed one is the live edge:
    // active while the transfer is still progressing, pending once it failed.
    if (index === lastDoneIndex + 1 && !failed) {
      return { stage: name, status: "active" as const, at: null };
    }

    return { stage: name, status: "pending" as const, at: null };
  });
}

/**
 * PRD Screen 5 pipeline: Encrypting -> Transmitting -> Receiving -> Decrypting
 * -> Completed. Driven entirely by the `stages` array so it renders identically
 * from live API data or MOCK_TRANSFER_DETAIL.
 */
export function StagePipeline({
  stages,
  failed = false,
  senderLabel = "Client",
  receiverLabel = "Server",
  children,
}: StagePipelineProps) {
  const resolved = resolveStages(stages, failed);
  const doneCount = resolved.filter((s) => s.status === "done").length;

  return (
    <div className={styles.pipeline}>
      <div className={styles.endpoints}>
        <span className={styles.endpoint}>
          <ClientIcon />
          {senderLabel}
        </span>
        <span className={styles.endpointRule} aria-hidden="true" />
        <span className={styles.endpoint}>
          <ServerIcon />
          {receiverLabel}
        </span>
      </div>

      {/*
        aria-live announces each stage transition once, so screen-reader users
        get the same progress information the pulsing marker conveys visually.
      */}
      <p className="sr-only" role="status" aria-live="polite">
        {doneCount} of {resolved.length} transfer stages complete.
      </p>

      <ol className={styles.stages}>
        {resolved.map((stage, index) => (
          <StageStep
            key={stage.stage}
            label={STAGE_LABEL[stage.stage]}
            description={STAGE_DESCRIPTION[stage.stage]}
            status={stage.status}
            at={stage.at}
            isLast={index === resolved.length - 1}
          />
        ))}
      </ol>

      {children && <div className={styles.summary}>{children}</div>}
    </div>
  );
}
