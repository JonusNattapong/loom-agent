import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { mutate } from "./api";
import { text } from "./types";

export function StatusPill({ value }: { value: unknown }) {
  const label = text(value, "unknown");
  const tone = /online|running|completed|approved|active|live|healthy/i.test(label) ? "good"
    : /failed|denied|offline|cancelled|error|stale/i.test(label) ? "bad"
    : /waiting|pending|queued|reconnect|paused/i.test(label) ? "warn" : "neutral";
  return <span class={`status status--${tone}`}><span aria-hidden="true" />{label}</span>;
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ComponentChildren }) {
  return <header class="page-header">
    <div><p class="eyebrow">{eyebrow}</p><h1>{title}</h1><p class="lede">{description}</p></div>
    {children && <div class="page-actions">{children}</div>}
  </header>;
}

export function LoadingRows() { return <div class="loading" role="status"><span /> Reading current state…</div>; }
export function Empty({ title, detail }: { title: string; detail: string }) { return <div class="empty"><strong>{title}</strong><p>{detail}</p></div>; }
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) { return <div class="notice notice--error" role="alert"><span>{message}</span>{retry && <button class="text-button" onClick={retry}>Try again</button>}</div>; }

export function ActionButton({ path, label, confirm, body, method, danger, onDone }: { path: string; label: string; confirm?: string; body?: unknown; method?: string; danger?: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async () => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true); setError("");
    try { await mutate(path, body, method); onDone(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed."); }
    finally { setBusy(false); }
  };
  return <span class="action-wrap">
    <button class={danger ? "button button--danger" : "button button--quiet"} disabled={busy} onClick={run}>{busy ? "Working…" : label}</button>
    {error && <span class="field-error" role="alert">{error}</span>}
  </span>;
}

export function Metric({ label, value, detail }: { label: string; value: unknown; detail?: string }) {
  return <div class="metric"><span>{label}</span><strong>{text(value, "0")}</strong>{detail && <small>{detail}</small>}</div>;
}

export function KeyValue({ label, value }: { label: string; value: unknown }) {
  return <div class="key-value"><dt>{label}</dt><dd>{text(value)}</dd></div>;
}
