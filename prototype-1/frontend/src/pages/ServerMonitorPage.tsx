import { useCallback } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { MOCK_SERVER_STATUS, MOCK_TRANSFERS } from "../lib/mockData";
import { EmptyState, ErrorState, FallbackNotice } from "../components/server/PageState";
import { MetricTile } from "../components/server/MetricTile";
import { StatusHero } from "../components/server/StatusHero";
import { TransferTable } from "../components/server/TransferTable";
import { usePolledResource } from "../components/server/usePolledResource";
import { normalizeServerStatus, type NormalizedServerStatus } from "../components/server/normalize";
import { padCount } from "../components/server/format";
import styles from "./ServerMonitorPage.module.css";

const POLL_INTERVAL_MS = 10_000;

const FALLBACK: NormalizedServerStatus = {
  ...MOCK_SERVER_STATUS,
  recent_transfers: MOCK_TRANSFERS,
};

/**
 * Server Monitor — the operator-facing view of the exchange (PRD FR-08).
 *
 * Reads GET /api/server/status on a 10s poll. Deliberately restrained: a status
 * banner, a counter grid, and a transfer table. No charts — the prototype has
 * no time-series data behind it, and faking one would be decoration.
 */
export function ServerMonitorPage() {
  const fetcher = useCallback(() => api.server.status(), []);

  const { data, state, error, usingFallback, lastUpdated, refreshing, refresh } =
    usePolledResource<NormalizedServerStatus>(fetcher, normalizeServerStatus, {
      fallback: FALLBACK,
      intervalMs: POLL_INTERVAL_MS,
    });

  if (state === "error") {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <h2 className={styles.pageTitle}>Server Monitor</h2>
          <p className={styles.pageSubtitle}>
            Live view of the CyberVault transfer service.
          </p>
        </header>
        <ErrorState error={error} onRetry={refresh} />
      </div>
    );
  }

  const loading = state === "loading";
  // Wire status is lowercase (API_CONTRACT.md §3.6); StatusHero displays
  // the uppercase form.
  const status = data?.status === "online" ? "ONLINE" : "OFFLINE";
  const transfers = data?.recent_transfers ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeading}>
          <h2 className={styles.pageTitle}>Server Monitor</h2>
          <p className={styles.pageSubtitle}>
            Live view of the CyberVault transfer service. Counts are global, not per account.
          </p>
        </div>
        {usingFallback && <FallbackNotice />}
      </header>

      <StatusHero
        status={status}
        uptimeSeconds={data?.uptime_seconds ?? 0}
        lastUpdated={lastUpdated}
        refreshing={refreshing}
        loading={loading}
        onRefresh={refresh}
      />

      <section aria-labelledby="server-metrics-heading">
        <h3 id="server-metrics-heading" className={styles.sectionTitle}>
          Traffic
        </h3>
        <div className={styles.metrics}>
          <MetricTile
            label="Connected clients"
            value={padCount(data?.connected_clients ?? 0)}
            caption="Active in the last 15 minutes"
            loading={loading}
          />
          <MetricTile
            label="Documents received"
            value={padCount(data?.documents_received ?? 0)}
            caption="Client → Server"
            loading={loading}
          />
          <MetricTile
            label="Documents sent"
            value={padCount(data?.documents_sent ?? 0)}
            caption="Server → Client"
            loading={loading}
          />
          <MetricTile
            label="Successful transfers"
            value={padCount(data?.successful_transfers ?? 0)}
            caption="Encrypted and decrypted end to end"
            loading={loading}
            accent="success"
          />
          <MetricTile
            label="Failed transfers"
            value={padCount(data?.failed_transfers ?? 0)}
            caption="Requires operator attention"
            loading={loading}
            accent={(data?.failed_transfers ?? 0) > 0 ? "danger" : "default"}
          />
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="recent-transfers-heading">
        <div className={styles.panelHeader}>
          <h3 id="recent-transfers-heading" className={styles.sectionTitle}>
            Recent transfers
          </h3>
          <Link to="/transfers" className={styles.panelLink}>
            View all transfers
          </Link>
        </div>

        {!loading && transfers.length === 0 ? (
          <EmptyState
            title="No transfers yet"
            description="Once a document is encrypted and sent, it will appear here with its algorithm, size and outcome."
          />
        ) : (
          <TransferTable transfers={transfers} loading={loading} />
        )}
      </section>
    </div>
  );
}
