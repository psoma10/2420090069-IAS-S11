import { Skeleton } from "./PageState";
import { formatAbsolute, formatClock } from "./format";
import { groupByDay } from "./groupByDay";
import type { ActivityItem } from "../../types/api";
import styles from "./ActivityTimeline.module.css";

/**
 * Classifies a log line for its rail marker colour. The contract says `action`
 * is the machine field, but `message` is the only field guaranteed to reach us
 * (see normalize.ts), so this reads the human string instead. Purely
 * decorative — no meaning is conveyed by the marker alone.
 */
function toneFor(message: string): string {
  const text = message.toLowerCase();
  if (text.includes("fail") || text.includes("error") || text.includes("denied")) return styles.danger;
  if (text.includes("complete") || text.includes("decrypted") || text.includes("success")) return styles.success;
  if (text.includes("encrypt") || text.includes("initiated") || text.includes("sent")) return styles.accent;
  return styles.neutral;
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
                  dateTime={item.created_at}
                  title={formatAbsolute(item.created_at)}
                >
                  {formatClock(item.created_at)}
                </time>
                <span className={[styles.marker, toneFor(item.message)].join(" ")} aria-hidden="true" />
                <span className={styles.message}>{item.message}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
