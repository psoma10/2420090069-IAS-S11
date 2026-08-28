import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../../lib/api";

export type ResourceState = "loading" | "ready" | "error";

export interface PolledResource<T> {
  data: T | null;
  state: ResourceState;
  /** Populated only when `state === "error"` and no fallback was supplied. */
  error: ApiError | null;
  /** True when showing MOCK_* fallback because the server was unreachable. */
  usingFallback: boolean;
  /** Timestamp of the last successful (or fallback) read, for "updated Xs ago". */
  lastUpdated: string | null;
  /** True while a background refresh is in flight over already-rendered data. */
  refreshing: boolean;
  refresh: () => void;
}

interface Options<T> {
  /** Rendered when the server is unreachable, per mockData.ts guidance. */
  fallback?: T;
  /** Poll period in ms. Omit or pass 0 for a single fetch. */
  intervalMs?: number;
}

/**
 * Fetch-and-poll helper for the monitoring screens.
 *
 * Only NETWORK_ERROR / SERVER_UNAVAILABLE fall back to sample data — auth and
 * validation failures surface as real errors, per the rule in mockData.ts.
 * Polling pauses while the tab is hidden so a backgrounded monitor does not
 * hammer the API, and resumes with an immediate read on return.
 */
export function usePolledResource<T>(
  fetcher: () => Promise<unknown>,
  select: (raw: unknown) => T,
  { fallback, intervalMs = 0 }: Options<T> = {},
): PolledResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<ResourceState>("loading");
  const [error, setError] = useState<ApiError | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Keep the latest fetcher/selector in refs so callers may pass inline
  // closures without restarting the poll loop on every render. Assigned in an
  // effect rather than during render — a render that never commits must not
  // leave a stale closure behind for the running interval to call.
  const fetcherRef = useRef(fetcher);
  const selectRef = useRef(select);
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    fetcherRef.current = fetcher;
    selectRef.current = select;
    fallbackRef.current = fallback;
  });

  const mountedRef = useRef(true);
  const hasDataRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (hasDataRef.current) setRefreshing(true);

    try {
      const raw = await fetcherRef.current();
      if (!mountedRef.current) return;
      setData(selectRef.current(raw));
      setUsingFallback(false);
      setError(null);
      setState("ready");
      setLastUpdated(new Date().toISOString());
      hasDataRef.current = true;
    } catch (err) {
      if (!mountedRef.current) return;
      const apiError =
        err instanceof ApiError ? err : new ApiError("Something went wrong.", "INTERNAL_ERROR", 0);
      const unreachable = apiError.code === "NETWORK_ERROR" || apiError.code === "SERVER_UNAVAILABLE";

      if (unreachable && fallbackRef.current !== undefined) {
        setData(fallbackRef.current);
        setUsingFallback(true);
        setError(null);
        setState("ready");
        setLastUpdated(new Date().toISOString());
        hasDataRef.current = true;
      } else {
        setError(apiError);
        setState("error");
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!intervalMs) return;

    let timer = window.setInterval(() => void load(), intervalMs);

    const handleVisibility = () => {
      window.clearInterval(timer);
      if (document.visibilityState === "visible") {
        void load();
        timer = window.setInterval(() => void load(), intervalMs);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [load, intervalMs]);

  const refresh = useCallback(() => {
    void load();
  }, [load]);

  return { data, state, error, usingFallback, lastUpdated, refreshing, refresh };
}
