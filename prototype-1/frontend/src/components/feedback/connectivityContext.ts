import { createContext, useContext } from "react";

export type ConnectivityStatus = "online" | "offline" | "checking";

export interface ConnectivityApi {
  status: ConnectivityStatus;
  /** True once a probe has confirmed the server is unreachable. */
  isOffline: boolean;
  /** Timestamp of the last successful reach, or null if never. */
  lastOnlineAt: number | null;
  /**
   * Report a failed request so the banner can appear immediately rather than
   * waiting for the next poll. Safe to call with any thrown value — non-network
   * errors are ignored.
   *
   *   catch (err) { reportError(err); setError(err); }
   */
  reportError: (error: unknown) => void;
  /** Report that a request succeeded, clearing the offline state at once. */
  reportSuccess: () => void;
  /** Re-probe the server now. Backs the RETRY button. Resolves to reachability. */
  retry: () => Promise<boolean>;
}

export const ConnectivityContext = createContext<ConnectivityApi | null>(null);

/**
 * Read app-wide server reachability.
 *
 * Usage:
 *   import { useConnectivity } from "../components/feedback/connectivityContext";
 *
 *   const { isOffline, reportError } = useConnectivity();
 *   try { await api.documents.list(); }
 *   catch (err) { reportError(err); }
 *
 * Pages that want to disable a submit button while the server is down can
 * read `isOffline` directly.
 */
export function useConnectivity(): ConnectivityApi {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error("useConnectivity must be used inside <ConnectivityProvider>.");
  return ctx;
}
