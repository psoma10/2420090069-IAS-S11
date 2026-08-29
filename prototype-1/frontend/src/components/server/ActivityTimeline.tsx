import { Skeleton } from "./PageState";
import { formatAbsolute, formatClock } from "./format";
import { groupByDay } from "./groupByDay";
import type { ActivityItem } from "../../types/api";
import styles from "./ActivityTimeline.module.css";

const TONE_BY_ACTION: Record<ActivityItem["action"], string> = {
  TRANSFER_FAILED: styles.danger,
  TRANSFER_COMPLETED: styles.success,
  TRANSFER_RECEIVED: styles.success,
  DOCUMENT_ENCRYPTED: styles.accent,
  TRANSFER_INITIATED: styles.accent,
  DOCUMENT_UPLOADED: styles.accent,
  USER_REGISTERED: styles.neutral,
  USER_LOGIN: styles.neutral,
  USER_LOGOUT: styles.neutral,
};

/**
 * Rail marker colour, keyed off the contract's `action` enum (§3.7). Purely
 * decorative — no meaning is conveyed by the marker alone, `message` always
 * carries it.
 */
function toneFor(action: ActivityItem["action"]): string {
  return TONE_BY_ACTION[action] ?? styles.neutral;
}

/**
 * Reverse-chronological activity log (PRD section 18).
 *
 * Timestamps are monospace and tabular so the time column stays rigid, matching
 * the ciphertext/key monospace convention. Entries are grouped under a sticky
 * day heading so a long log stays oriented while scrolling.
 */
export function ActivityTimeline({ items, loading }: { items: ActivityItem[]; loading: boolean }) {
  if (loading) {
    return (
      <div className={styles.skeletonList}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={styles.skeletonRow}>
            <Skeleton width="44px" height={13} />
            <Skeleton width={`${38 + ((i * 13) % 34)}%`} height={13} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.timeline}>
      {groupByDay(items).map((group) => (
        <section key={group.key} className={styles.group} aria-label={group.label}>
          <h3 className={styles.dayHeading}>{group.label}</h3>

          <ol className={styles.list}>
            {group.items.map((item) => (
              <li key={item.id} className={styles.entry}>
                <time
                  className={styles.time}
                  dateTime={item.at}
                  title={formatAbsolute(item.at)}
                >
                  {formatClock(item.at)}
                </time>
                <span className={[styles.marker, toneFor(item.action)].join(" ")} aria-hidden="true" />
                <span className={styles.message}>{item.message}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
