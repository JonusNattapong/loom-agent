import { useState } from "preact/hooks";
import { login } from "./api";
import { ActionButton, Empty, ErrorNotice, KeyValue, LoadingRows, Metric, PageHeader, StatusPill } from "./components";
import { useResource } from "./hooks";
import { isRecord, records, text, timestamp, type JsonRecord } from "./types";
import { routeHref } from "./routing";


export function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [operatorToken, setOperatorToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: SubmitEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try { await login(operatorToken); setOperatorToken(""); onLogin(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Sign in failed."); }
    finally { setBusy(false); }
  };
  return <main class="login-shell">
    <section class="login-context" aria-label="Loom overview">
      <div class="brand brand--login"><span class="brand-mark" aria-hidden="true">L</span><span>Loom</span></div>
      <p class="eyebrow">Local operations / v0.9</p>
      <h1>Keep the work visible.<br />Keep control local.</h1>
      <p>Inspect live agents, review approvals, and intervene in durable work from one operator surface.</p>
      <div class="signal-diagram" aria-hidden="true"><i /><i /><i /><i /><i /></div>
    </section>
    <section class="login-panel">
      <form class="login-card" onSubmit={submit}>
        <p class="eyebrow">Authorized operators</p><h2>Sign in</h2>
        <p class="muted">Use the operator token created by your Loom administrator. It stays in memory only for this exchange.</p>
        {error && <ErrorNotice message={error} />}
        <label>Operator token<input name="token" type="password" autoComplete="off" spellcheck={false} required value={operatorToken} onInput={e => setOperatorToken(e.currentTarget.value)} /></label>
        <button class="button button--primary button--full" disabled={busy}>{busy ? "Signing in…" : "Sign in to console"}</button>
      </form>
    </section>
  </main>;
}

export function DashboardPage({ generation }: { generation: number }) {
  const state = useResource<JsonRecord>("/summary", generation);
  return <><PageHeader eyebrow="System overview" title="Operations at a glance" description="Live workload, intervention points, and infrastructure health in one scan." />
    {state.error && <ErrorNotice message={state.error} retry={() => void state.refresh()} />}
    {state.loading ? <LoadingRows /> : <>
      <section class="metric-grid" aria-label="System metrics">
        <Metric label="Known agents" value={isRecord(state.data?.counts) ? state.data.counts.agents : 0} detail="Durable records" />
        <Metric label="Queued jobs" value={isRecord(state.data?.jobs) ? state.data.jobs.queued : 0} detail="Awaiting capacity" />
        <Metric label="Pending approvals" value={isRecord(state.data?.counts) ? state.data.counts.pendingApprovals : 0} detail="Operator decision" />
        <Metric label="Registered workers" value={isRecord(state.data?.counts) ? state.data.counts.workers : 0} detail="Known executors" />
      </section>
      <div class="dashboard-grid">
        <section class="panel"><div class="panel-head"><h2>Daemon</h2><StatusPill value={isRecord(state.data?.daemon) && state.data.daemon.running ? "running" : "offline"} /></div><p class="muted">The durable scheduler and job runner report through the local control plane.</p></section>
        <section class="panel"><div class="panel-head"><h2>Queue health</h2><a href="/jobs">Inspect jobs</a></div><dl><KeyValue label="Running" value={isRecord(state.data?.jobs) ? state.data.jobs.running : 0} /><KeyValue label="Failed" value={isRecord(state.data?.jobs) ? state.data.jobs.failed : 0} /></dl></section>
      </div>
    </>}
  </>;
}


export function AgentsPage({ generation }: { generation: number }) {
  const state = useResource<unknown>("/agents", generation); const rows = records(state.data, "agents");
  return <><PageHeader eyebrow="Execution" title="Agents" description="Track responsibility, current state, and each agent's durable trail." />
    <ResourceFrame state={state} empty="No agents have started.">{rows.length > 0 && <DataTable labels={["Agent", "Role", "Status", "Goal", "Updated"]} rows={rows.map(row => [<a href={routeHref("agents", row.id)}>{text(row.name ?? row.id)}</a>, text(row.role), <StatusPill value={row.status} />, text(row.goal ?? row.task), timestamp(row.updatedAt)])} />}</ResourceFrame>
  </>;
}

export function AgentDetailPage({ id, generation }: { id: string; generation: number }) {
  const state = useResource<JsonRecord>(`/agents/${encodeURIComponent(id)}`, generation); const row = isRecord(state.data?.agent) ? state.data.agent : state.data;
  return <><PageHeader eyebrow="Agent detail" title={text(row?.name ?? row?.id, id)} description={text(row?.goal ?? row?.task, "Inspect this agent's assigned work and execution state.")} /><ResourceFrame state={state} empty="Agent not found.">{row && <DetailBody row={row} />}</ResourceFrame></>;
}

export function WorkersPage({ generation }: { generation: number }) {
  const state = useResource<unknown>("/workers", generation); const rows = records(state.data, "workers");
  return <><PageHeader eyebrow="Infrastructure" title="Workers" description="Connection health, capability, and current assignment across remote executors." />
    <ResourceFrame state={state} empty="No workers are registered.">{rows.length > 0 && <DataTable labels={["Worker", "Status", "Capabilities", "Assignment", "Last seen"]} rows={rows.map(row => [<a href={routeHref("workers", row.id ?? row.workerId)}>{text(row.name ?? row.workerId ?? row.id)}</a>, <StatusPill value={row.status} />, Array.isArray(row.capabilities) ? row.capabilities.join(", ") : text(row.capabilities), text(row.assignmentId ?? row.activeAssignment), timestamp(row.lastSeenAt ?? row.updatedAt)])} />}</ResourceFrame>
  </>;
}

export function WorkerDetailPage({ id, generation }: { id: string; generation: number }) {
  const state = useResource<JsonRecord>(`/workers/${encodeURIComponent(id)}`, generation);
  const row = isRecord(state.data?.worker) ? state.data.worker : state.data;
  return <><PageHeader eyebrow="Worker detail" title={text(row?.name ?? row?.workerId, id)} description="Connection identity, capacity, and authorized execution scope." />
    <ResourceFrame state={state} empty="Worker not found.">{row && <DetailBody row={row} />}</ResourceFrame></>;
}

export function JobsPage({ generation }: { generation: number }) {
  const state = useResource<unknown>("/jobs", generation); const rows = records(state.data, "jobs");
  return <><PageHeader eyebrow="Work queue" title="Jobs" description="Durable background work, retry state, and outcomes managed by the daemon." />
    <ResourceFrame state={state} empty="The job queue is empty.">{rows.length > 0 && <DataTable labels={["Job", "Type", "Status", "Attempts", "Updated", "Actions"]} rows={rows.map(row => {
      const id = text(row.id, ""); return [id, text(row.type), <StatusPill value={row.status} />, `${text(row.attempt, "0")} / ${text(row.maxAttempts, "—")}`, timestamp(row.updatedAt), <div class="action-row"><ActionButton path={`/jobs/${encodeURIComponent(id)}/retry`} label="Retry" confirm="Queue this job for another attempt?" onDone={() => void state.refresh()} /><ActionButton path={`/jobs/${encodeURIComponent(id)}/cancel`} label="Cancel" danger confirm="Cancel this job? Running external work may not be reversible." onDone={() => void state.refresh()} /></div>]; })} />}</ResourceFrame>
  </>;
}

export function SchedulesPage({ generation }: { generation: number }) {
  const state = useResource<unknown>("/schedules", generation); const rows = records(state.data, "schedules");
  return <><PageHeader eyebrow="Automation" title="Schedules" description="Recurring and one-time work with visible timing and overlap policy." />
    <ResourceFrame state={state} empty="No schedules are configured.">{rows.length > 0 && <DataTable labels={["Schedule", "Expression", "State", "Next run", "Actions"]} rows={rows.map(row => { const id=text(row.id, ""); const enabled=row.enabled !== false; return [text(row.name ?? id), text(row.expression), <StatusPill value={enabled ? "active" : "paused"} />, timestamp(row.nextRunAt), <div class="action-row"><ActionButton path={`/schedules/${encodeURIComponent(id)}/${enabled ? "pause" : "resume"}`} label={enabled ? "Pause" : "Resume"} confirm={`${enabled ? "Pause" : "Resume"} this schedule?`} onDone={() => void state.refresh()} /><ActionButton path={`/schedules/${encodeURIComponent(id)}`} method="DELETE" label="Delete" danger confirm="Delete this schedule? Existing jobs will not be removed." onDone={() => void state.refresh()} /></div>]; })} />}</ResourceFrame>
  </>;
}

export function ApprovalsPage({ generation }: { generation: number }) {
  const state = useResource<unknown>("/approvals", generation); const rows = records(state.data, "approvals");
  return <><PageHeader eyebrow="Human decisions" title="Approvals" description="Review requested capabilities before work is allowed to continue." />
    <ResourceFrame state={state} empty="No approvals need attention.">{rows.length > 0 && <div class="approval-list">{rows.map(row => { const id=text(row.id, ""); return <article class="approval" key={id}><div><p class="eyebrow">{text(row.toolName ?? row.type, "Action request")}</p><h2>{text(row.reason ?? row.summary, "Review requested action")}</h2><dl><KeyValue label="Agent" value={row.agentId} /><KeyValue label="Requested" value={timestamp(row.createdAt)} /><KeyValue label="Status" value={row.status} /></dl></div><div class="action-row"><ActionButton path={`/approvals/${encodeURIComponent(id)}/approve`} label="Approve" confirm="Approve this exact action? Review its scope before continuing." onDone={() => void state.refresh()} /><ActionButton path={`/approvals/${encodeURIComponent(id)}/deny`} label="Deny" danger confirm="Deny this action? The waiting task may fail." onDone={() => void state.refresh()} /></div></article>; })}</div>}</ResourceFrame>
  </>;
}

export function TracesPage({ generation }: { generation: number }) {
  const agents = useResource<unknown>("/agents", generation);
  const rows = records(agents.data, "agents");
  const [agentId, setAgentId] = useState("");
  return <><PageHeader eyebrow="Audit trail" title="Traces" description="Correlated lifecycle events. Sensitive payloads are intentionally not rendered." />
    {agents.error && <ErrorNotice message={agents.error} retry={() => void agents.refresh()} />}
    {agents.loading ? <LoadingRows /> : <>
      <label class="filter-field">Agent<select value={agentId} onChange={event => setAgentId(event.currentTarget.value)}><option value="">Select an agent</option>{rows.map(row => <option value={text(row.id, "")} key={text(row.id, "")}>{text(row.name ?? row.id)}</option>)}</select></label>
      {agentId ? <AgentTraceTable id={agentId} generation={generation} /> : <Empty title="Choose an agent" detail="Trace timelines are scoped to an agent to keep retrieval bounded." />}
    </>}
  </>;
}

function AgentTraceTable({ id, generation }: { id: string; generation: number }) {
  const state = useResource<unknown>(`/agents/${encodeURIComponent(id)}/traces?limit=200`, generation);
  const rows = records(state.data, "traces");
  return <ResourceFrame state={state} empty="No trace events recorded.">{rows.length > 0 && <DataTable labels={["Time", "Event", "Agent", "Task", "Summary"]} rows={rows.map(row => [timestamp(row.createdAt), text(row.type), text(row.agentId), text(row.taskId), text(row.summary ?? row.message)])} />}</ResourceFrame>;
}

export function RoutesPage({ generation }: { generation: number }) {
  const state = useResource<unknown>("/routes", generation); const rows = records(state.data, "routes");
  return <><PageHeader eyebrow="Dispatch policy" title="Routes" description="Available execution routes and the capabilities advertised to the controller." />
    <ResourceFrame state={state} empty="No routes are currently available.">{rows.length > 0 && <DataTable labels={["Route", "Provider", "Model", "Status", "Scope"]} rows={rows.map(row => [text(row.name ?? row.id), text(row.provider), text(row.model), <StatusPill value={row.status ?? "available"} />, Array.isArray(row.capabilities) ? row.capabilities.join(", ") : text(row.scope ?? row.capabilities)])} />}</ResourceFrame>
  </>;
}

function ResourceFrame({ state, empty, children }: { state: { loading: boolean; refreshing: boolean; error?: string; refresh: () => Promise<void> }; empty: string; children: preact.ComponentChildren }) {
  return <section aria-busy={state.refreshing}>{state.error && <ErrorNotice message={state.error} retry={() => void state.refresh()} />}{state.loading ? <LoadingRows /> : children || <Empty title={empty} detail="Refresh this view after new activity is created." />}</section>;
}

function DataTable({ labels, rows }: { labels: string[]; rows: preact.ComponentChildren[][] }) {
  return <div class="table-wrap"><table><thead><tr>{labels.map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} data-label={labels[j]}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

function DetailBody({ row }: { row: JsonRecord }) {
  const safe = ["id", "workerId", "status", "role", "parentAgentId", "rootAgentId", "connectionId", "transport", "goal", "task", "lastSeenAt", "createdAt", "updatedAt"];
  return <div class="detail-grid"><section class="panel"><div class="panel-head"><h2>Recorded state</h2><StatusPill value={row.status} /></div><dl>{safe.filter(key => row[key] !== undefined).map(key => <KeyValue key={key} label={key.replace(/([A-Z])/g, " $1")} value={key.endsWith("At") ? timestamp(row[key]) : row[key]} />)}</dl></section><section class="panel"><div class="panel-head"><h2>Operational note</h2></div><p class="muted">This view shows bounded metadata only. Credentials, raw tool inputs, and unrestricted trace payloads are never displayed.</p></section></div>;
}
