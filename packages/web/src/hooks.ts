import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { get } from "./api";

export interface ResourceState<T> {
  data?: T;
  error?: string;
  loading: boolean;
  refreshing: boolean;
  refresh: () => Promise<void>;
}

export function useResource<T>(path: string, generation = 0): ResourceState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await get<T>(path);
      if (mounted.current) { setData(next); setError(undefined); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "Could not load data.");
    } finally { if (mounted.current) setRefreshing(false); }
  }, [path]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; };
  }, [refresh, generation]);
  return { data, error, loading: data === undefined && refreshing, refreshing: data !== undefined && refreshing, refresh };
}

export type StreamStatus = "connecting" | "live" | "reconnecting";
export function useEvents(enabled: boolean, onInvalidate: () => void): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const callback = useRef(onInvalidate);
  callback.current = onInvalidate;
  useEffect(() => {
    if (!enabled) { setStatus("connecting"); return; }
    const source = new EventSource("/api/v1/events", { withCredentials: true });
    let timer: number | undefined;
    source.onopen = () => setStatus("live");
    source.onerror = () => setStatus("reconnecting");
    const invalidate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => callback.current(), 120);
    };
    source.onmessage = invalidate;
    for (const name of ["invalidate", "snapshot", "agent.updated", "worker.connected", "worker.disconnected", "worker.updated", "remote.assignment.updated", "job.updated", "schedule.updated", "schedule.deleted", "approval.created", "approval.resolved"]) {
      source.addEventListener(name, invalidate);
    }
    return () => { window.clearTimeout(timer); source.close(); };
  }, [enabled]);
  return status;
}
