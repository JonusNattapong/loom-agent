# V0.9 control API

The control API is JSON over HTTP(S) under `/api/v1`. Except for health and login, endpoints require the operator session cookie described in [Operator authentication](operator-auth.md). JSON mutations also require an exact allowed `Origin` and the current `X-CSRF-Token`.

Responses include `X-Request-Id` and use `Cache-Control: no-store`. Errors have the form:

```json
{"error":{"code":"not_found","message":"resource not found","requestId":"req_..."},"message":"resource not found"}
```

## Authentication and status

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/auth/login` | Exchange `Authorization: Bearer <operator-token>` for cookie + CSRF token. |
| `GET` | `/auth/session` | Validate the cookie and rotate/return the CSRF token. |
| `POST` | `/auth/logout` | Revoke the session and clear the cookie; Origin + CSRF required. |
| `GET` | `/health` | Public health, API version, daemon ID, and uptime. |
| `GET` | `/summary` | Dashboard counts, job summary, next schedule, and recent failures. |
| `GET` | `/dashboard` | Alias of `/summary`. |

Paths in the tables omit the `/api/v1` prefix.

## Read endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/agents` | Filters: `rootAgentId`, `status`, `role`, `parentAgentId`, `createdAfter`; supports `offset`/`limit`. |
| `GET` | `/agents/:id` | Agent with children, delegations, artifacts, plan, and tasks. |
| `GET` | `/agents/:id/tasks` | Tasks for the root plan. |
| `GET` | `/agents/:id/plan` | Plan and revisions. |
| `GET` | `/agents/:id/reviews` | Reviews associated with plan tasks. |
| `GET` | `/agents/:id/trace` | Latest trace rows; `limit` 1–500, optional `rootTimeline=true`. |
| `GET` | `/jobs` | Optional `status`; supports `offset`/`limit`. |
| `GET` | `/jobs/:id` | One job. |
| `GET` | `/schedules` | All schedules. |
| `GET` | `/schedules/:id` | One schedule. |
| `GET` | `/approvals` | Optional `rootAgentId` and `status`; supports `offset`/`limit`. |
| `GET` | `/approvals/:id` | One approval. |
| `GET` | `/workers` | Workers. |
| `GET` | `/workers/:id` | Worker, Loom address, assignments, connections, and leases. |
| `GET` | `/workers/:id/assignments` | Assignments for a worker. |
| `GET` | `/workers/:id/leases` | Leases for a worker. |
| `GET` | `/remote/assignments` | Optional `status` and `workerId`; supports `offset`/`limit`. |
| `GET` | `/remote/assignments/:id` | Assignment, lease, and up to 50 execution events. |
| `GET` | `/remote-assignments[/:id]` | Compatibility alias for remote assignments. |
| `GET` | `/traces` | Optional `type`, `since`, `workerId`, `jobId`, `assignmentId`; `limit` 1–500. |
| `GET` | `/traces/:id` | Root-timeline trace for an agent; optional `limit` 1–500. |
| `GET` | `/audit` | Optional `afterId`, `action`, `resourceType`; `limit` 1–200. |
| `GET` | `/routes` | Current worker route descriptors. |
| `GET` | `/routes/<encoded-loom-address>` | Resolve one route, for example `/routes/loom%3A%2F%2Fworker%2Fgpu-01`. |

General collection pagination defaults to `limit=50`, has a maximum of 200, and accepts `offset`. Endpoint-specific limits above override that behavior.

## Mutations

All mutation bodies, when present, must use `Content-Type: application/json` and contain a JSON object.

| Method | Path | Behavior |
|---|---|---|
| `POST` | `/jobs/:id/cancel` | Cancel a job only from a cancellable state. |
| `POST` | `/jobs/:id/retry` | Requeue a failed or cancelled job. |
| `POST` | `/schedules` | Create a schedule from the supplied schedule object. |
| `DELETE` | `/schedules/:id` | Delete a schedule. |
| `POST` | `/schedules/:id/pause` | Disable a schedule. |
| `POST` | `/schedules/:id/resume` | Enable a schedule. |
| `POST` | `/approvals/:id/approve` | Approve a pending request. |
| `POST` | `/approvals/:id/deny` | Deny a pending request. |

`controlPlane.readOnly: true` rejects these mutations with 403. It does not prevent logout.

## Server-sent events

`GET /api/v1/events` opens an authenticated `text/event-stream`. Browser clients normally use the same-origin session cookie. Replay starts after either the `Last-Event-ID` header or the `after` query parameter. The stream polls durable control events, sends batches of up to 200, and emits heartbeat comments. It revalidates expiry, idle timeout, and revocation, and logout closes streams belonging to that session.

Every data record uses the SSE event name `invalidate`:

```text
id: 42
event: invalidate
data: {"id":42,"type":"job.updated","resourceType":"job","resourceId":"job_...","data":{"status":"running"},"createdAt":...}
```

The inner `type` identifies the actual change, including job, schedule, agent, approval, worker, and remote-assignment updates. Consumers should invalidate/refetch the affected resource rather than treat this stream as a complete state replica. Streams are bounded by the configured server capacity and are closed when the control server stops.

## Scope

The API reports and operates on the single daemon's SQLite-backed state. It is not a distributed API and offers no NAT traversal, P2P/VPN/relay transport, mesh, consensus, or distributed storage.
