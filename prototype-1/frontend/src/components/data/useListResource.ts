import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "../../lib/api";

/** Network-class failures are the only ones allowed to fall back to mock data. */
function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "NETWORK_ERROR" || error.code === "SERVER_UNAVAILABLE");
}

interface ListResourceState<T> {
  rows: T[];
  total: number;
  loading: boolean;
  /** Set when the live API failed and `rows` came from mock data. */
  offlineMessage: string | null;
  /** Set when the request failed for a non-network reason — render an error state. */
  error: string | null;
  reload: () => void;
}

interface Options<T> {
  /** Executes the API call. Must resolve to the rows + total. */
  fetcher: () => Promise<{ rows: T[]; total: number }>;
  /** Rendered instead when the server is unreachable, per mockData.ts guidance. */
  fallback: T[];
  /** Re-runs the fetcher whenever any of these change. */
  deps: unknown[];
}

/**
 * Shared loader for the paginated list screens. Attempts the live API, and on
 * NETWORK_ERROR / SERVER_UNAVAILABLE only, renders contract-shaped mock data
 * with a visible banner — other errors surface as real errors rather than
 * being masked by fake rows.
 */
export function useListResource<T>({ fetcher, fallback, deps }: Options<T>): ListResourceState<T> {
  const [state, setState] = useState<{ rows: T[]; total: number; offlineMessage: string | null; error: string | null }>({
    rows: [],
    total: 0,
    offlineMessage: null,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  // deps is intentionally spread into the dependency array by the caller.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const depsKey = useMemo(() => JSON.stringify(deps), deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetcher()
      .then((result) => {
        if (cancelled) return;
        setState({ rows: result.rows, total: result.total, offlineMessage: null, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isOfflineError(error)) {
          setState({
            rows: fallback,
            total: fallback.length,
            offlineMessage: "Server unreachable — showing sample data for demonstration.",
            error: null,
          });
          return;
        }
        setState({
          rows: [],
          total: 0,
          offlineMessage: null,
          error: error instanceof ApiError ? error.message : "Something went wrong while loading this list.",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, reloadToken]);

  return { ...state, loading, reload };
}
