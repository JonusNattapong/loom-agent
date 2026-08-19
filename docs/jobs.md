# Background jobs

Jobs are SQLite records with typed `agent_run`/`scheduled_agent_run` payloads, priority ordering, idempotency keys, attempts, and a lease. Claiming is transactional. A job maps its root agent before adaptive execution; restart recovery requeues stale ownership and resumes the same root. Retry backoff is bounded. External side effects remain governed by the existing ToolExecutor ledger, so Loom does not claim universal exactly-once networking.

```bash
loom jobs
loom jobs --status running
loom job inspect <id>
loom job cancel <id>
loom job retry <id>
```

## Approval waiting

Approval-gated execution becomes `waiting`, records `waitingReason=approval` and the durable approval reference, releases the execution lease, and does not consume a retry attempt. Approval resolution wakes the same job and root. Denial is terminal and is not treated as a provider retry.
