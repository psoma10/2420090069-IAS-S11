import { Link } from "react-router-dom";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { DashboardSkeleton } from "../components/dashboard/DashboardSkeleton";
import { RecentActivityList } from "../components/dashboard/RecentActivityList";
import { RecentTransfersList } from "../components/dashboard/RecentTransfersList";
import { StatCard } from "../components/dashboard/StatCard";
import { useDashboardData } from "../components/dashboard/useDashboardData";
import { formatPercent } from "../components/dashboard/format";
import {
  AlertIcon,
  FileTextIcon,
  KeyIcon,
  PlusIcon,
  ShieldCheckIcon,
  TransferIcon,
} from "../components/dashboard/icons";
import { useAuth } from "../context/AuthContext";
import styles from "./DashboardPage.module.css";

/**
 * PRD Screen 2 / FR-02. One request to GET /api/dashboard supplies every
 * number on this page — no fan-out to /documents, /transfers or /activity.
 */
export function DashboardPage() {
  const { user } = useAuth();
  const { status, data, source, error, reload } = useDashboardData();

  const firstName = user?.name?.trim().split(/\s+/)[0];

  if (status === "loading") {
    return (
      <div className={styles.page} aria-busy="true">
        <p className="sr-only" role="status">
          Loading dashboard…
        </p>
        <DashboardSkeleton />
      </div>
    );
  }

  if (status === "error" || !data) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Dashboard</h1>
        <Card padding="lg" className={styles.errorCard}>
          <span className={styles.errorIcon} aria-hidden="true">
            <AlertIcon />
          </span>
          <div className={styles.errorBody}>
            <h2 className={styles.errorTitle}>We couldn't load your dashboard</h2>
            <p className={styles.errorText}>{error ?? "An unexpected error occurred."}</p>
          </div>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const isOnline = data.server_status === "ONLINE";
  const failedTransfers = Math.max(data.transfers_total - data.successful_transfers, 0);

  return (
    <div className={styles.page}>
      {/* --- Header: identity, server status, primary action --- */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>Secure document exchange</p>
          <h1 className={styles.title}>{firstName ? `Welcome back, ${firstName}` : "Dashboard"}</h1>
          <div className={styles.statusLine}>
            {/* Colour + dot + explicit word — status is never colour-only. */}
            <Badge tone={isOnline ? "success" : "danger"} dot>
              {isOnline ? "Server online" : "Server offline"}
            </Badge>
            {source === "sample" && (
              <Badge tone="warning" dot>
                Sample data — backend unreachable
              </Badge>
            )}
          </div>
        </div>

        <Link to="/upload" className={styles.ctaLink}>
          <Button size="lg" className={styles.cta}>
            <span className={styles.ctaInner}>
              <PlusIcon />
              Secure Document
            </span>
          </Button>
        </Link>
      </header>

      {/* --- Stat row: system state in under three seconds --- */}
      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          System overview
        </h2>
        <dl className={styles.statGrid}>
          <StatCard
            label="Documents"
            value={data.documents_total}
            hint="Uploaded to your vault"
            icon={<FileTextIcon />}
            accent="accent"
          />
          <StatCard
            label="Transfers"
            value={data.transfers_total}
            hint={failedTransfers > 0 ? `${failedTransfers} did not complete` : "All accounted for"}
            icon={<TransferIcon />}
            accent="info"
          />
          <StatCard
            label="Algorithms"
            value={data.algorithms_available}
            hint="Caesar, Playfair, SDES, AES"
            icon={<KeyIcon />}
            accent="warning"
          />
          <StatCard
            label="Success Rate"
            value={formatPercent(data.success_rate)}
            hint={`${data.successful_transfers} of ${data.transfers_total} succeeded`}
            icon={<ShieldCheckIcon />}
            accent="success"
          />
        </dl>
      </section>

      {/* --- Detail panels --- */}
      <div className={styles.panels}>
        <Card padding="lg" className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent transfers</h2>
            <Link to="/transfers" className={styles.panelLink}>
              View all
            </Link>
          </div>
          <RecentTransfersList transfers={data.recent_transfers} />
        </Card>

        <Card padding="lg" className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Recent activity</h2>
            <Link to="/activity" className={styles.panelLink}>
              View all
            </Link>
          </div>
          <RecentActivityList items={data.recent_activity} />
        </Card>
      </div>
    </div>
  );
}
