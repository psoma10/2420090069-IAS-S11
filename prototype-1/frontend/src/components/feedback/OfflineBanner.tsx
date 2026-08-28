import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { useConnectivity } from "./connectivityContext";
import { CheckCircleIcon, RetryIcon, ServerOffIcon } from "./icons";
import styles from "./OfflineBanner.module.css";

/** How long the green "connection restored" confirmation stays up. */
const RESTORED_MS = 3200;

/**
 * Persistent banner shown whenever the backend is unreachable.
 *
 * Copy is verbatim from PRD section 17 (Server Unavailable):
 *   SERVER OFFLINE
 *   Unable to establish connection.
 *   [ RETRY ]
 *
 * Reads state from <ConnectivityProvider>, which combines a background probe
 * of /api/server/status with reportError() calls from pages. Renders nothing
 * while online, apart from a brief confirmation after a recovery so the user
 * knows it is safe to retry their action.
 *
 * Usage: mount once inside the app shell, directly beneath the header.
 *   import { OfflineBanner } from "../feedback/OfflineBanner";
 *   <OfflineBanner />
 */
export function OfflineBanner() {
  const { isOffline, status, retry } = useConnectivity();

  /*
    "Adjusting state when a prop changes" pattern: compare the live offline
    flag against the value we last rendered with. Storing the previous value
    in state (not a ref) keeps the comparison legal during render, so the
    recovery confirmation appears in the same pass that clears the outage
    instead of costing a second render.
  */
  const [prevOffline, setPrevOffline] = useState(isOffline);
  const [showRestored, setShowRestored] = useState(false);

  if (prevOffline !== isOffline) {
    setPrevOffline(isOffline);
    // Only the offline -> online edge earns a confirmation.
    setShowRestored(prevOffline && !isOffline);
  }

  // Retire the confirmation after a few seconds. A timer is a real external
  // system, which is what an effect is for.
  useEffect(() => {
    if (!showRestored) return;
    const handle = window.setTimeout(() => setShowRestored(false), RESTORED_MS);
    return () => window.clearTimeout(handle);
  }, [showRestored]);

  if (showRestored && !isOffline) {
    return (
      <div className={[styles.banner, styles.restored].join(" ")} role="status" aria-live="polite">
        <CheckCircleIcon className={styles.icon} size={18} />
        <span className={styles.pulse} aria-hidden="true" />
        <div className={styles.copy}>
          <span className={styles.title}>Connection restored</span>
          <span className={styles.message}>CyberVault server is reachable again.</span>
        </div>
      </div>
    );
  }

  if (!isOffline) return null;

  const checking = status === "checking";

  return (
    // role="alert" so the outage interrupts — it blocks every action on screen.
    <div className={styles.banner} role="alert" aria-live="assertive">
      <ServerOffIcon className={styles.icon} size={18} />
      <span className={styles.pulse} aria-hidden="true" />
      <div className={styles.copy}>
        <span className={styles.title}>Server offline</span>
        <span className={styles.message}>Unable to establish connection.</span>
        <span className={styles.since}>{checking ? "Reconnecting…" : "Retrying automatically"}</span>
      </div>
      <div className={styles.actions}>
        <Button size="sm" variant="secondary" onClick={() => void retry()} loading={checking}>
          <RetryIcon size={14} />
          RETRY
        </Button>
      </div>
    </div>
  );
}
