import type { TransferStage } from "../../types/api";
import styles from "./StageStep.module.css";

/** All stage icons share a 16px box and 1.5 stroke for optical consistency. */
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

function CheckIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}

/** Filled dot marks the stage currently in flight. */
function ActiveDotIcon() {
  return (
    <svg {...ICON_PROPS} fill="currentColor" stroke="none">
      <circle cx="8" cy="8" r="3.5" />
    </svg>
  );
}

/** Hollow circle marks a stage that has not started. */
function PendingIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="8" cy="8" r="3.25" />
    </svg>
  );
}

function FailedIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M5 5l6 6" />
      <path d="M11 5l-6 6" />
    </svg>
  );
}

/** Formats an ISO timestamp as local wall-clock time with milliseconds. */
function formatStageTime(at: string | null): string | null {
  if (!at) return null;
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

const STATUS_WORD: Record<TransferStage["status"], string> = {
  pending: "Pending",
  active: "In progress",
  done: "Complete",
  failed: "Failed",
};

export interface StageStepProps {
  label: string;
  description: string;
  status: TransferStage["status"];
  at: string | null;
  isLast: boolean;
}

/**
 * One stage in the transfer pipeline. Status is conveyed by icon shape, colour,
 * and an accessible text label together — never by colour alone.
 */
export function StageStep({ label, description, status, at, isLast }: StageStepProps) {
  const timestamp = formatStageTime(at);

  const stateClass =
    status === "done"
      ? styles.stepDone
      : status === "active"
        ? styles.stepActive
        : status === "failed"
          ? styles.stepFailed
          : "";

  const icon =
    status === "done" ? (
      <CheckIcon />
    ) : status === "active" ? (
      <ActiveDotIcon />
    ) : status === "failed" ? (
      <FailedIcon />
    ) : (
      <PendingIcon />
    );

  return (
    <li className={[styles.step, stateClass, isLast ? styles.stepLast : ""].filter(Boolean).join(" ")}>
      <div className={styles.markerCol}>
        <span className={styles.marker}>
          {status === "active" && <span className={styles.pulse} aria-hidden="true" />}
          {icon}
        </span>
      </div>
      <div className={styles.content}>
        <div className={styles.labelGroup}>
          <span className={styles.label}>
            {label}
            <span className="sr-only"> — {STATUS_WORD[status]}</span>
          </span>
          <span className={styles.description}>{description}</span>
        </div>
        {timestamp && <span className={styles.timestamp}>{timestamp}</span>}
      </div>
    </li>
  );
}
