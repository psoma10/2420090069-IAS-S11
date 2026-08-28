import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../../lib/api";
import { MOCK_DASHBOARD } from "../../lib/mockData";
import type { DashboardData } from "../../types/api";

/** Error codes that mean "backend not reachable" — safe to fall back to sample data. */
const OFFLINE_CODES = ["NETWORK_ERROR", "SERVER_UNAVAILABLE"] as const;

export type DashboardSource = "live" | "sample";

export interface DashboardState {
  status: "loading" | "ready" | "error";
  data: DashboardData | null;
  /** Where `data` came from — drives the "sample data" disclosure banner. */
  source: DashboardSource;
  error: string | null;
  reload: () => void;
}

function isOffline(error: unknown): boolean {
  return error instanceof ApiError && (OFFLINE_CODES as readonly string[]).includes(error.code);
}

/**
 * Single-request dashboard loader (API_CONTRACT §3.6 — GET /api/dashboard).
 * Never fans out to other endpoints.
 *
 * Failure policy: only NETWORK_ERROR / SERVER_UNAVAILABLE degrade to
 * MOCK_DASHBOARD so the screen still demonstrates real layout. Every other
 * code (UNAUTHORIZED, INTERNAL_ERROR, ...) surfaces a real error state —
 * masking those would hide genuine bugs behind plausible-looking numbers.
 */
export function useDashboardData(): DashboardState {
  const [status, setStatus] = useState<DashboardState["status"]>("loading");
  const [data, setData] = useState<DashboardData | null>(null);
  const [source, setSource] = useState<DashboardSource>("live");
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setError(null);

    void (async () => {
      try {
        const live = (await api.dashboard.get()) as DashboardData;
        if (cancelled) return;
        setData(live);
        setSource("live");
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        if (isOffline(err)) {
          setData(MOCK_DASHBOARD);
          setSource("sample");
          setStatus("ready");
          return;
        }
        setData(null);
        setSource("live");
        setError(err instanceof ApiError ? err.message : "Something went wrong loading your dashboard.");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { status, data, source, error, reload };
}
