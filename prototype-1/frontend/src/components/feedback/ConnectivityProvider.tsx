import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "../../lib/api";
import { isOfflineCode } from "../../lib/errorMessages";
import { ConnectivityContext, type ConnectivityApi, type ConnectivityStatus } from "./connectivityContext";

/** How often to re-probe while the server is believed to be up. */
const POLL_ONLINE_MS = 30_000;
/** Faster cadence while down, so recovery is noticed quickly. */
const POLL_OFFLINE_MS = 8_000;

/**
 * Tracks whether the CyberVault backend is reachable, app-wide.
 *
 * Two signals feed the same state, which is why this is a provider rather
 * than a plain polling hook:
 *
 *   1. A background probe of GET /api/server/status. The API contract
 *      (section 3.7) states the backend cannot report its own downtime, so an
 *      unreachable probe *is* the offline signal.
 *   2. reportError(err) from any page's catch block, so a failed user action
 *      flips the banner on instantly instead of waiting for the next poll.
 *
 * Mount once, above the router. Pair with <OfflineBanner /> inside the shell.
 */
export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectivityStatus>("online");
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(null);

  // Guards against overlapping probes when a manual retry races the poller.
  const probing = useRef(false);
  // Avoids setState after unmount from an in-flight probe.
  const mounted = useRef(true);

  const probe = useCallback(async (): Promise<boolean> => {
    if (probing.current) return status !== "offline";
    probing.current = true;
    try {
      await api.server.status();
      if (mounted.current) {
        setStatus("online");
        setLastOnlineAt(Date.now());
      }
      return true;
    } catch (error) {
      // Only a transport failure means offline. A 401 or a 500 proves the
      // server answered, so the connection itself is fine.
      const unreachable = error instanceof ApiError && isOfflineCode(error.code);
      if (mounted.current) {
        if (unreachable) {
          setStatus("offline");
        } else {
          setStatus("online");
          setLastOnlineAt(Date.now());
        }
      }
      return !unreachable;
    } finally {
      probing.current = false;
    }
  }, [status]);

  const retry = useCallback(async (): Promise<boolean> => {
    setStatus("checking");
    return probe();
  }, [probe]);

  const reportError = useCallback((error: unknown) => {
    if (error instanceof ApiError && isOfflineCode(error.code)) setStatus("offline");
  }, []);

  const reportSuccess = useCallback(() => {
    setStatus("online");
    setLastOnlineAt(Date.now());
  }, []);

  // Poll on a cadence that tightens while down.
  useEffect(() => {
    mounted.current = true;
    const interval = status === "offline" ? POLL_OFFLINE_MS : POLL_ONLINE_MS;
    const handle = window.setInterval(() => {
      // Don't burn requests against a hidden tab.
      if (document.visibilityState === "visible") void probe();
    }, interval);
    return () => {
      window.clearInterval(handle);
    };
  }, [probe, status]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Browser-level connectivity events are a cheap extra signal: losing the
  // network is definitive, regaining it is only a hint worth re-probing.
  useEffect(() => {
    const onOffline = () => setStatus("offline");
    const onOnline = () => void probe();
    const onVisible = () => {
      if (document.visibilityState === "visible") void probe();
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [probe]);

  const value = useMemo<ConnectivityApi>(
    () => ({ status, isOffline: status === "offline", lastOnlineAt, reportError, reportSuccess, retry }),
    [lastOnlineAt, reportError, reportSuccess, retry, status],
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}
