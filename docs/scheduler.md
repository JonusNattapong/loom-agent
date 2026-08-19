# Persistent scheduler

Schedules are stored in SQLite and materialized transactionally into jobs. V0.7 supports one-shot ISO timestamps, minute/hour/day intervals, and a bounded five-field cron form. Timezone is persisted with each schedule. Due occurrence identity is `scheduleId + intendedRunAt`, preventing duplicate logical jobs after restart. Paused schedules are disabled; one-shot schedules disable after materialization.

```bash
loom schedule add --at "2026-08-20T09:00:00+07:00" --goal "Inspect failures"
loom schedule add --every 30m --goal "Check pending work"
loom schedule add --cron "0 8 * * *" --timezone Asia/Bangkok --goal "Daily status"
loom schedules
loom schedule pause <id>
loom schedule resume <id>
loom schedule delete <id>
```

The local implementation uses `run_once`-style bounded materialization; advanced catch-up/DST semantics remain future work.

## Restart and misfires

The default one-shot behavior is effectively `run_once`: an overdue schedule materializes one logical occurrence using the schedule ID and intended run time, then advances/disables the schedule. The occurrence/job transaction and process restart E2E prevent duplicate jobs. The bounded cron implementation persists timezone metadata but is not a full DST-aware calendar engine.
