# Loom daemon

V0.7 provides a durable local foreground daemon. `loom daemon start` claims jobs, renews local ownership through heartbeats, materializes due schedules, and supervises the configured runtime. A database heartbeat prevents a second live daemon from starting; stale ownership is recoverable.

Commands:

```bash
loom daemon start --foreground
loom daemon status
loom daemon stop
```

Foreground mode is the portable default. Graceful stop stops polling and bot supervision, waits for a checkpoint boundary up to the configured grace period, records shutdown, and closes state.

## Hardening semantics

A graceful stop clears polling and heartbeat timers, stops bot supervision, waits for the active runner to reach a safe boundary, records `stopped`, and closes the caller-owned state store. A hard process death leaves the daemon heartbeat stale; the next daemon reclaims stale job leases and preserves the job's root mapping. The process E2E suite covers both boundaries.

The daemon uses `SIGTERM`/`SIGINT` through the central lifecycle in the CLI; foreground mode is the portable launch path.
