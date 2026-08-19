# Loom daemon

V0.7 provides a durable local foreground daemon. `loom daemon start` claims jobs, renews local ownership through heartbeats, materializes due schedules, and supervises the configured runtime. A database heartbeat prevents a second live daemon from starting; stale ownership is recoverable.

Commands:

```bash
loom daemon start --foreground
loom daemon status
loom daemon stop
```

Foreground mode is the portable default. Graceful stop stops polling and bot supervision, waits for a checkpoint boundary up to the configured grace period, records shutdown, and closes state.
