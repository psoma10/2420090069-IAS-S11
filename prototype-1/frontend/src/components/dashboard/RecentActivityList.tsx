import { EmptyState } from "./EmptyState";
import { PulseIcon } from "./icons";
import { absoluteTime, relativeTime } from "./format";
import styles from "./RecentActivityList.module.css";
import type { ActivityItem } from "../../types/api";

type Tone = "encrypt" | "transfer" | "receive" | "decrypt" | "fail" | "default";

/**
 * Activity messages are free-form strings from the backend (§3.8), so tone is
 * derived from keywords purely for the timeline dot. The message text itself
 * always carries the meaning — colour is never the only signal.
 */
function toneFor(message: string): Tone {
  const text = message.toLowerCase();
  if (text.includes("fail") || text.includes("error")) return "fail";
  if (text.includes("decrypt")) return "decrypt";
  if (text.includes("receiv")) return "receive";
  if (text.includes("encrypt")) return "encrypt";
  if (text.includes("transfer") || text.includes("sent") || text.includes("upload")) return "transfer";
  return "default";
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
          <span className={[styles.dot, styles[toneFor(item.message)]].join(" ")} aria-hidden="true" />
          <p className={styles.message}>{item.message}</p>
          <time className={styles.time} dateTime={item.created_at} title={absoluteTime(item.created_at)}>
            {relativeTime(item.created_at)}
          </time>
        </li>
      ))}
    </ol>
  );
}
