import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { MOCK_DASHBOARD } from "../lib/mockData";
import { Button } from "../components/ui/Button";
import { EmptyState, ErrorState, FallbackNotice } from "../components/server/PageState";
import { ActivityTimeline } from "../components/server/ActivityTimeline";
import { usePolledResource } from "../components/server/usePolledResource";
import { normalizeActivity } from "../components/server/normalize";
import { formatRelative } from "../components/server/format";
import type { ActivityItem } from "../types/api";
import styles from "./ActivityPage.module.css";

const POLL_INTERVAL_MS = 15_000;

/** Newest-first, per API_CONTRACT.md section 6. Sorted defensively anyway. */
const FALLBACK: ActivityItem[] = [...MOCK_DASHBOARD.recent_activity].sort((a, b) =>
  b.created_at.localeCompare(a.created_at),
);

/**
 * Activity log (PRD section 18) — a chronological record of what the account
 * did: uploads, encryptions, transfers, session events.
 *
 * Reads GET /api/activity on a 15s poll. Activity is scoped to the
 * authenticated user, unlike the global counters on the Server Monitor.
 */
export function ActivityPage() {
  const [query, setQuery] = useState("");

  const fetcher = useCallback(() => api.activity.list(), []);

  const { data, state, error, usingFallback, lastUpdated, refreshing, refresh } =
    usePolledResource<ActivityItem[]>(fetcher, normalizeActivity, {
      fallback: FALLBACK,
      intervalMs: POLL_INTERVAL_MS,
    });

  const items = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => item.message.toLowerCase().includes(term));
  }, [items, query]);

  if (state === "error") {
    return (
      <div className={styles.page}>
        <PageHeading />
        <ErrorState error={error} onRetry={refresh} />
      </div>
    );
  }

  const loading = state === "loading";
  const hasAny = items.length > 0;
  const hasMatches = filtered.length > 0;

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <PageHeading />
        <div className={styles.headerMeta}>
          {usingFallback && <FallbackNotice />}
          {lastUpdated && !usingFallback && (
            <span className={styles.updated}>Updated {formatRelative(lastUpdated)}</span>
          )}
          <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing}>
            Refresh
          </Button>
        </div>
      </header>

      <div className={styles.panel}>
        <div className={styles.toolbar}>
          <div className={styles.searchField}>
            <label htmlFor="activity-filter" className="sr-only">
              Filter activity
            </label>
            <span className={styles.searchIcon} aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              id="activity-filter"
              type="search"
              className={styles.search}
              placeholder="Filter activity"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              disabled={loading || !hasAny}
            />
          </div>

          <p className={styles.count} role="status" aria-live="polite">
            {loading
              ? "Loading…"
              : query
                ? `${filtered.length} of ${items.length} events`
                : `${items.length} ${items.length === 1 ? "event" : "events"}`}
          </p>
        </div>

        {!loading && !hasAny && (
          <EmptyState
            title="No activity recorded yet"
            description="Uploads, encryptions and transfers are logged here as you use CyberVault."
            action={
              <Button variant="primary" size="sm" as-child={undefined} onClick={undefined}>
                <Link to="/upload" className={styles.emptyLink}>
                  Go to Secure Upload
                </Link>
              </Button>
            }
          />
        )}

        {!loading && hasAny && !hasMatches && (
          <EmptyState
            title="No matching activity"
            description={`Nothing in this log matches “${query.trim()}”. Try a shorter or different term.`}
            action={
              <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                Clear filter
              </Button>
            }
          />
        )}

        {(loading || hasMatches) && <ActivityTimeline items={filtered} loading={loading} />}
      </div>
    </div>
  );
}

function PageHeading() {
  return (
    <div className={styles.pageHeading}>
      <h2 className={styles.pageTitle}>Activity</h2>
      <p className={styles.pageSubtitle}>
        A chronological record of document, encryption and transfer events on your account.
      </p>
    </div>
  );
}
