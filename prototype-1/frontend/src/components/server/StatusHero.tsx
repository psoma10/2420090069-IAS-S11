import { Button } from "../ui/Button";
import { Skeleton } from "./PageState";
import { formatRelative, formatUptime } from "./format";
import styles from "./StatusHero.module.css";

interface StatusHeroProps {
  status: "ONLINE" | "OFFLINE";
  uptimeSeconds: number;
  lastUpdated: string | null;
  refreshing: boolean;
  loading: boolean;
  onRefresh: () => void;
}

/**
 * Server state banner.
 *
 * Status is carried by three redundant channels — colour, the pulsing/steady
 * beacon, and the ONLINE/OFFLINE word — so it survives greyscale printing and
 * colour-blindness. The live region announces transitions to screen readers.
 */
export function StatusHero({
  status,
  uptimeSeconds,
  lastUpdated,
  refreshing,
  loading,
  onRefresh,
}: StatusHeroProps) {
  const online = status === "ONLINE";

  return (
    <section
      className={[styles.hero, online ? styles.online : styles.offline].join(" ")}
      aria-labelledby="server-status-heading"
    >
      <div className={styles.identity}>
        <p className={styles.eyebrow}>CyberVault Server</p>

        <div className={styles.statusRow}>
          <span className={styles.beacon} aria-hidden="true">
            <span className={styles.beaconCore} />
            {online && <span className={styles.beaconPulse} />}
          </span>

          {loading ? (
            <Skeleton width="7ch" height={34} />
          ) : (
            <h2 id="server-status-heading" className={styles.statusText}>
              {status}
            </h2>
          )}
        </div>

        {/* Politely announced so status flips are heard without stealing focus. */}
        <p className="sr-only" role="status" aria-live="polite">
          {loading ? "Checking server status" : `Server is ${status.toLowerCase()}`}
        </p>

        <p className={styles.summary}>
          {loading
            ? "Checking the transfer service…"
            : online
              ? "Accepting encrypted transfers from connected clients."
              : "Not accepting transfers. Start the backend to resume the exchange."}
        </p>
      </div>

      <div className={styles.meta}>
        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Uptime</span>
          {loading ? (
            <Skeleton width="6ch" height={18} />
          ) : (
            <span className={styles.metaValue}>{online ? formatUptime(uptimeSeconds) : "—"}</span>
          )}
        </div>

        <div className={styles.metaItem}>
          <span className={styles.metaLabel}>Last checked</span>
          <span className={styles.metaValue}>
            {lastUpdated ? formatRelative(lastUpdated) : "—"}
          </span>
        </div>

        <Button variant="secondary" size="sm" onClick={onRefresh} loading={refreshing}>
          Refresh
        </Button>
      </div>
    </section>
  );
}
