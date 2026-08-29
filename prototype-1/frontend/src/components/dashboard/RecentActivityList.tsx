import { EmptyState } from "./EmptyState";
import { PulseIcon } from "./icons";
import { absoluteTime, relativeTime } from "./format";
import styles from "./RecentActivityList.module.css";
import type { ActivityItem } from "../../types/api";

type Tone = "encrypt" | "transfer" | "receive" | "decrypt" | "fail" | "default";

const TONE_BY_ACTION: Record<ActivityItem["action"], Tone> = {
  TRANSFER_FAILED: "fail",
  TRANSFER_COMPLETED: "decrypt",
  TRANSFER_RECEIVED: "receive",
  DOCUMENT_ENCRYPTED: "encrypt",
  TRANSFER_INITIATED: "transfer",
  DOCUMENT_UPLOADED: "transfer",
  USER_REGISTERED: "default",
  USER_LOGIN: "default",
  USER_LOGOUT: "default",
};

/**
 * Timeline dot colour, keyed off the contract's `action` enum (§3.7). The
 * message text itself always carries the meaning — colour is never the only
 * signal.
 */
function toneFor(action: ActivityItem["action"]): Tone {
  return TONE_BY_ACTION[action] ?? "default";
}

interface RecentActivityListProps {
  items: ActivityItem[];
}

export function RecentActivityList({ items }: RecentActivityListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<PulseIcon />}
        title="No activity yet"
        description="Encryptions, transfers and decryptions will appear here as you use CyberVault."
      />
    );
  }

  return (
    <ol className={styles.feed}>
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <span className={[styles.dot, styles[toneFor(item.action)]].join(" ")} aria-hidden="true" />
          <p className={styles.message}>{item.message}</p>
          <time className={styles.time} dateTime={item.at} title={absoluteTime(item.at)}>
            {relativeTime(item.at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
